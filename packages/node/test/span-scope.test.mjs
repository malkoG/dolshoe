import assert from "node:assert/strict";
import test from "node:test";

import { init, close } from "../dist/index.mjs";

function collectingClient() {
  const spans = [];
  const logs = [];
  const client = init({
    service: { name: "checkout-api" },
    transport: { async send() {} },
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
    captureUnhandledErrors: false,
  });
  return { client, spans, logs };
}

/**
 * The reason `@dolshoe/node` installs its own span scope rather than using
 * core's fallback: with one shared variable, whichever request started a span
 * last would become the parent of both.
 */
test("two concurrent requests do not become each other's parent", async () => {
  const { client, spans } = collectingClient();

  async function handle(name, delay) {
    return client.withSpan(name, async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      client.withSpan(`${name} child`, () => {});
      await new Promise((resolve) => setTimeout(resolve, delay));
    });
  }

  // Interleaved on purpose: the second request starts its span while the first
  // is awaiting, and finishes its child after the first has resumed.
  await Promise.all([handle("first", 30), handle("second", 10)]);
  await client.flush();

  const byName = Object.fromEntries(spans.map((span) => [span.name, span]));

  assert.equal(byName["first child"].parentSpanId, byName.first.spanId);
  assert.equal(byName["second child"].parentSpanId, byName.second.spanId);
  assert.equal(byName["first child"].traceId, byName.first.traceId);
  assert.equal(byName["second child"].traceId, byName.second.traceId);
  assert.notEqual(byName.first.traceId, byName.second.traceId);

  await close();
});

// Correlation across an await is exactly what the synchronous fallback cannot
// do, and what a request handler needs.
test("a log written after an await still lands on the span that was active", async () => {
  const { client, spans, logs } = collectingClient();

  function deepInsideSomeLibrary() {
    client.captureLog("info", "no span was threaded into this function");
  }

  await client.withSpan("POST /checkout", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    deepInsideSomeLibrary();
  });
  await client.flush();

  assert.equal(spans.length, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].trace.traceId, spans[0].traceId);
  assert.equal(logs[0].trace.spanId, spans[0].spanId);

  await close();
});
