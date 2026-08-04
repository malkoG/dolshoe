import { configure, dispose, getLogger } from "@logtape/logtape";
import { getDolshoeSink } from "@dolshoe/logtape";

const PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";
const TOKEN = "dsh_a1b2c3d4e5f6_TFhQb2xzaG9lRXhhbXBsZVNlY3JldFZhbHVlSGVyZQ";
const DSN = `https://${TOKEN}@dolshoe.example/${PROJECT_ID}`;

export async function runScenario(dolshoe) {
  const reports = [];
  const logRecords = [];
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

  logger.info("Submitting order {orderId}", {
    orderId: "order-123",
    route: "/orders",
  });
  logger.error("Order {orderId} failed", {
    orderId: "order-123",
    route: "/orders",
    retryCount: 0,
    error,
  });

  await dispose();
  const flushed = await dolshoe.flush();
  if (!flushed || reports.length !== 1 || logRecords.length !== 1) {
    throw new Error(
      `Expected one report and one log record, received ${reports.length} and ${logRecords.length}.`,
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

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ report: reports[0], logRecord: logRecords[0] }));
}
