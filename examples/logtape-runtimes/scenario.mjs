import { configure, dispose, getLogger } from "@logtape/logtape";
import { getDolshoeSink } from "@dolshoe/logtape";

const PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";
const TOKEN = "dsh_a1b2c3d4e5f6_TFhQb2xzaG9lRXhhbXBsZVNlY3JldFZhbHVlSGVyZQ";
const DSN = `https://${TOKEN}@dolshoe.example/${PROJECT_ID}`;

/** Deeper than the ten frames a JavaScript runtime keeps by default. */
const DEEP_STACK_DEPTH = 60;

function descend(depth) {
  if (depth === 0) throw new Error("bottom of a deep stack");
  descend(depth - 1);
}

/**
 * What each runtime actually kept, rather than what it was asked to keep.
 *
 * @remarks
 * `Error.stackTraceLimit` is V8's, and Deno and Bun reach it through their own
 * compatibility surfaces; whether writing it took effect is not something the
 * reporter can know from the inside. Throwing from a known depth and counting
 * what came back is the only honest test, and it has to run on all three.
 */
function measureDeepStack(dolshoe) {
  try {
    descend(DEEP_STACK_DEPTH);
  } catch (thrown) {
    const { frames } = dolshoe.normalizeException(thrown);
    const innermost = frames[0];
    return {
      requestedDepth: DEEP_STACK_DEPTH,
      frameCount: frames.length,
      origins: [...new Set(frames.map((frame) => frame.origin))].toSorted(),
      innermost: innermost?.origin,
      sourceLine: innermost?.sourceLine,
      contextLines: (innermost?.preContext?.length ?? 0) + (innermost?.postContext?.length ?? 0),
    };
  }
  throw new Error("expected a throw");
}

export async function runScenario(dolshoe) {
  const reports = [];
  const logRecords = [];
  const exportedSpans = [];
  const requests = [];
  const eventIds = ["6608e55d-1b24-4d9a-951f-7e7211f92f44", "bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7"];

  // Configured the way a real application is — from a DSN — and intercepted at
  // fetch rather than at the transport, so each runtime exercises the endpoints
  // and credential the DSN derives, not just the payload shape.
  dolshoe.init({
    dsn: DSN,
    service: {
      name: "checkout-api",
      environment: "test",
      release: "2026.07.24.1",
    },
    fetch: async (input, init) => {
      const url = input.toString();
      const body = JSON.parse(init.body);
      requests.push({ url, authorization: init.headers.authorization });
      if (url.endsWith("/log-records")) {
        logRecords.push(...body.records);
      } else if (url.endsWith("/traces")) {
        for (const resourceSpans of body.resourceSpans) {
          for (const scopeSpans of resourceSpans.scopeSpans) {
            exportedSpans.push(
              ...scopeSpans.spans.map((span) => ({ ...span, resource: resourceSpans.resource })),
            );
          }
        }
      } else {
        reports.push(body);
      }
      return new Response(null, { status: 201 });
    },
    captureUnhandledErrors: false,
    generateEventId: () => eventIds.shift(),
  });

  await configure({
    sinks: {
      dolshoe: getDolshoeSink({ dolshoe }),
    },
    loggers: [
      {
        category: [],
        sinks: ["dolshoe"],
        lowestLevel: "info",
      },
    ],
  });

  const cause = new Error("Cart was not loaded");
  const error = new AggregateError(
    [new TypeError("Inventory is unavailable"), "payment was declined"],
    "Order submission failed",
    { cause },
  );
  const logger = getLogger(["checkout", "orders"]);

  // Inside a span, and across an await, so each runtime has to keep the active
  // span through async context rather than only within one synchronous stretch.
  await dolshoe.withSpan(
    "POST /orders",
    async (span) => {
      span.setAttributes({ "http.request.method": "POST", "http.route": "/orders" });

      logger.info("Submitting order {orderId}", {
        orderId: "order-123",
        route: "/orders",
      });

      await new Promise((resolve) => setTimeout(resolve, 5));

      await dolshoe.withSpan("authorize payment", (child) => {
        child.setStatus("error", "payment was declined");
      });

      logger.error("Order {orderId} failed", {
        orderId: "order-123",
        route: "/orders",
        retryCount: 0,
        error,
      });
    },
    { kind: "server" },
  );

  await dispose();
  const flushed = await dolshoe.flush();
  if (!flushed || reports.length !== 1 || logRecords.length !== 1 || exportedSpans.length !== 2) {
    throw new Error(
      `Expected one report, one log record, and two spans; received ${reports.length}, ${logRecords.length}, and ${exportedSpans.length}.`,
    );
  }

  const expectedBase = `https://dolshoe.example/api/v1/projects/${PROJECT_ID}`;
  const wrongTarget = requests.find(
    (request) =>
      !request.url.startsWith(expectedBase) || request.authorization !== `Bearer ${TOKEN}`,
  );
  if (wrongTarget) {
    throw new Error(
      `The DSN produced an unexpected request target: ${JSON.stringify(wrongTarget)}.`,
    );
  }

  // Trace and span ids are random, so they cannot be compared across runtimes
  // directly. What can be compared is the shape they form: which span is whose
  // parent, and whether the log and the report landed on the span that was
  // active when they were written.
  const [child, root] = exportedSpans;
  const identifiers = new Map([
    [root.traceId, "<trace>"],
    [root.spanId, "<root span>"],
    [child.spanId, "<child span>"],
  ]);
  const label = (id) => identifiers.get(id) ?? `<unknown ${id}>`;

  const trace = {
    root: {
      name: root.name,
      kind: root.kind,
      parentSpanId: root.parentSpanId ?? null,
      status: root.status,
      attributes: root.attributes,
      resource: root.resource,
    },
    child: {
      name: child.name,
      kind: child.kind,
      parent: label(child.parentSpanId),
      sameTrace: child.traceId === root.traceId,
      status: child.status,
    },
    logRecordSpan: label(logRecords[0].trace?.spanId),
    reportSpan: label(reports[0].trace?.spanId),
  };

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      report: reports[0],
      logRecord: logRecords[0],
      trace,
      deepStack: measureDeepStack(dolshoe),
    }),
  );
}
