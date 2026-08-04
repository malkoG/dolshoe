import assert from "node:assert/strict";
import test from "node:test";

import { Client, toOtlpTraceRequest } from "../dist/index.mjs";

function collectingClient(overrides = {}) {
  const spans = [];
  const reports = [];
  const logs = [];

  const client = new Client({
    service: { name: "checkout-api", environment: "production", release: "1.2.3" },
    runtime: { name: "node", version: "24.4.0" },
    reporter: { name: "dolshoe-node", version: "0.1.0" },
    transport: {
      async send(report) {
        reports.push(report);
      },
    },
    logTransport: {
      async send(records) {
        logs.push(...records);
      },
    },
    spanTransport: {
      async send(batch) {
        spans.push(...batch);
      },
    },
    ...overrides,
  });

  return { client, spans, reports, logs };
}

test("a span started inside another inherits its trace and names it as parent", async () => {
  const { client, spans } = collectingClient();

  client.withSpan("POST /checkout", () => {
    client.withSpan("db.query", (child) => {
      assert.equal(typeof child.spanId, "string");
    });
  });
  await client.flush();

  assert.equal(spans.length, 2);
  const [child, root] = spans;
  // The child ends first, so it is sent first.
  assert.equal(child.name, "db.query");
  assert.equal(root.name, "POST /checkout");
  assert.equal(child.traceId, root.traceId);
  assert.equal(child.parentSpanId, root.spanId);
  assert.equal(root.parentSpanId, undefined);
});

test("ids look like the identifiers OTLP expects", async () => {
  const { client, spans } = collectingClient();

  client.withSpan("work", () => {});
  await client.flush();

  assert.match(spans[0].traceId, /^[0-9a-f]{32}$/);
  assert.match(spans[0].spanId, /^[0-9a-f]{16}$/);
});

test("parent: null starts a new trace even inside an active span", async () => {
  const { client, spans } = collectingClient();

  client.withSpan("outer", () => {
    client.withSpan("unrelated", () => {}, { parent: null });
  });
  await client.flush();

  const [unrelated, outer] = spans;
  assert.notEqual(unrelated.traceId, outer.traceId);
  assert.equal(unrelated.parentSpanId, undefined);
});

test("a thrown error fails the span, is reported, and still reaches the caller", async () => {
  const { client, spans, reports } = collectingClient();

  assert.throws(() => {
    client.withSpan("POST /checkout", () => {
      throw new Error("card declined");
    });
  }, /card declined/);
  await client.flush();

  assert.equal(spans[0].status.code, "error");
  assert.equal(spans[0].status.message, "card declined");
  assert.equal(reports[0].exception.message, "card declined");
  // The report carries the failing span, not just the trace.
  assert.equal(reports[0].trace.spanId, spans[0].spanId);
});

test("a rejected promise fails the span, and the rejection is not swallowed", async () => {
  const { client, spans } = collectingClient();

  await assert.rejects(
    client.withSpan("POST /checkout", async () => {
      throw new Error("upstream timed out");
    }),
    /upstream timed out/,
  );
  await client.flush();

  assert.equal(spans[0].status.code, "error");
});

test("an async span stays open until its work finishes", async () => {
  const { client, spans } = collectingClient();

  await client.withSpan("POST /checkout", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await client.flush();

  const elapsed = BigInt(spans[0].endTimeUnixNano) - BigInt(spans[0].startTimeUnixNano);
  assert.ok(elapsed >= 15_000_000n, `expected at least 15ms, measured ${elapsed}ns`);
});

// The whole point of the signal being first class: a log written inside a span
// lands on it without the caller threading ids through.
test("captureLog and captureException pick up the active span", async () => {
  const { client, spans, logs, reports } = collectingClient();

  client.withSpan("POST /checkout", () => {
    client.captureLog("info", "authorizing payment");
    client.captureException(new Error("declined"));
  });
  await client.flush();

  assert.equal(logs[0].trace.traceId, spans[0].traceId);
  assert.equal(logs[0].trace.spanId, spans[0].spanId);
  assert.equal(reports[0].trace.spanId, spans[0].spanId);
});

test("an explicitly supplied trace still wins over the active span", async () => {
  const { client, logs } = collectingClient();
  const explicit = { traceId: "a".repeat(32), spanId: "b".repeat(16) };

  client.withSpan("POST /checkout", () => {
    client.captureLog("info", "somewhere else", { trace: explicit });
  });
  await client.flush();

  assert.deepEqual(logs[0].trace, explicit);
});

test("a log outside any span carries no trace, as before", async () => {
  const { client, logs } = collectingClient();

  client.captureLog("info", "no span here");
  await client.flush();

  assert.equal(logs[0].trace, undefined);
});

test("attributes and status set on a span are reported with it", async () => {
  const { client, spans } = collectingClient();

  client.withSpan("db.query", (span) => {
    span.setAttributes({ "db.system.name": "postgresql", "db.rows_affected": 17 });
    span.setStatus("ok");
  });
  await client.flush();

  assert.deepEqual(spans[0].attributes, {
    "db.system.name": "postgresql",
    "db.rows_affected": 17,
  });
  assert.equal(spans[0].status.code, "ok");
});

test("ending a span twice reports it once", async () => {
  const { client, spans } = collectingClient();

  const span = client.startSpan("work");
  span.end();
  span.end();
  await client.flush();

  assert.equal(spans.length, 1);
});

test("an unended span is never sent", async () => {
  const { client, spans } = collectingClient();

  client.startSpan("still running");
  await client.flush();

  assert.equal(spans.length, 0);
});

test("a span ended after close is dropped", async () => {
  const { client, spans } = collectingClient();

  const span = client.startSpan("work");
  await client.close();
  span.end();
  await client.flush();

  assert.equal(spans.length, 0);
});

test("flush resolves only once the transport has the batch", async () => {
  let delivered = false;
  const { client } = collectingClient({
    spanTransport: {
      async send() {
        await new Promise((resolve) => setTimeout(resolve, 30));
        delivered = true;
      },
    },
  });

  client.withSpan("work", () => {});
  await client.flush();

  assert.equal(delivered, true);
});

test("beforeSendSpan can drop a span", async () => {
  const { client, spans } = collectingClient({
    beforeSendSpan: (span) => (span.name === "noisy" ? null : span),
  });

  client.withSpan("noisy", () => {});
  client.withSpan("kept", () => {});
  await client.flush();

  assert.deepEqual(
    spans.map((span) => span.name),
    ["kept"],
  );
});

test("serializes to the OTLP shape the API reads", async () => {
  const { client, spans } = collectingClient();

  client.withSpan("POST /checkout", (span) => {
    span.setAttributes({ "http.request.method": "POST", "http.response.status_code": 500 });
    span.setStatus("error", "upstream failed");
  });
  await client.flush();

  const request = toOtlpTraceRequest(spans, {
    service: { name: "checkout-api", environment: "production", release: "1.2.3" },
    reporter: { name: "dolshoe-node", version: "0.1.0" },
    runtime: { name: "node", version: "24.4.0" },
  });

  const resource = request.resourceSpans[0];
  const attributeOf = (key) =>
    resource.resource.attributes.find((pair) => pair.key === key)?.value.stringValue;

  assert.equal(attributeOf("service.name"), "checkout-api");
  assert.equal(attributeOf("service.version"), "1.2.3");
  assert.equal(attributeOf("deployment.environment.name"), "production");
  assert.equal(attributeOf("telemetry.sdk.name"), "dolshoe-node");

  const otlpSpan = resource.scopeSpans[0].spans[0];
  assert.equal(otlpSpan.kind, 1);
  assert.equal(otlpSpan.status.code, 2);
  assert.equal(otlpSpan.status.message, "upstream failed");
  // Nanoseconds are strings, and an int64 attribute is too: proto3 JSON's rule.
  assert.equal(typeof otlpSpan.startTimeUnixNano, "string");
  assert.equal(
    otlpSpan.attributes.find((pair) => pair.key === "http.response.status_code")?.value.intValue,
    "500",
  );
});

test("a span kind reaches the wire as its OTLP number", async () => {
  const { client, spans } = collectingClient();

  client.withSpan("POST /checkout", () => {}, { kind: "server" });
  await client.flush();

  const request = toOtlpTraceRequest(spans, {
    service: { name: "checkout-api" },
    reporter: { name: "dolshoe-node", version: "0.1.0" },
    runtime: { name: "node", version: "24.4.0" },
  });

  assert.equal(request.resourceSpans[0].scopeSpans[0].spans[0].kind, 2);
});
