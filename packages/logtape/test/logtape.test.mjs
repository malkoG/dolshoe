import assert from "node:assert/strict";
import test from "node:test";

import { getDolshoeSink } from "../dist/index.mjs";

function record(overrides = {}) {
  return {
    category: ["checkout", "orders"],
    level: "error",
    message: ["Order ", "order-123", " failed"],
    rawMessage: "Order {orderId} failed",
    timestamp: Date.parse("2026-07-24T08:30:00.000Z"),
    properties: {
      orderId: "order-123",
      error: new TypeError("invalid order"),
    },
    ...overrides,
  };
}

test("routes Error properties to captureException", () => {
  const calls = [];
  const sink = getDolshoeSink({
    dolshoe: {
      captureException: (...args) => {
        calls.push(args);
        return "event-id";
      },
      captureMessage: () => undefined,
      captureLog: () => undefined,
      flush: async () => true,
      close: async () => true,
    },
  });

  sink(record());

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].message, "invalid order");
  assert.deepEqual(calls[0][1], {
    occurredAt: Date.parse("2026-07-24T08:30:00.000Z"),
    mechanism: { type: "logtape", handled: true },
    attributes: {
      orderId: "order-123",
      "logtape.category": "checkout.orders",
      "logtape.level": "error",
      "logtape.message": "Order order-123 failed",
    },
  });
});

test("routes error-level messages without Error properties to captureLog", () => {
  const calls = [];
  const sink = getDolshoeSink({
    dolshoe: {
      captureException: () => undefined,
      captureMessage: () => undefined,
      captureLog: (...args) => {
        calls.push(args);
        return "event-id";
      },
      flush: async () => true,
      close: async () => true,
    },
  });

  sink(record({ properties: { orderId: "order-123" } }));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "error",
    "Order order-123 failed",
    {
      occurredAt: Date.parse("2026-07-24T08:30:00.000Z"),
      category: ["checkout", "orders"],
      attributes: { orderId: "order-123" },
    },
  ]);
});

test("routes records below the error level to captureLog", () => {
  const calls = [];
  const sink = getDolshoeSink({
    dolshoe: {
      captureException: () => undefined,
      captureMessage: () => undefined,
      captureLog: (...args) => {
        calls.push(args);
        return "event-id";
      },
      flush: async () => true,
      close: async () => true,
    },
  });

  sink(record({ level: "info" }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "info");
});

test("keeps warning-level Error properties as structured log attributes", () => {
  const calls = [];
  const sink = getDolshoeSink({
    dolshoe: {
      captureException: () => undefined,
      captureMessage: () => undefined,
      captureLog: (...args) => {
        calls.push(args);
        return "event-id";
      },
      flush: async () => true,
      close: async () => true,
    },
  });

  sink(record({ level: "warning" }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "warning");
  assert.equal(calls[0][2].attributes.error.message, "invalid order");
});

test("ignores LogTape meta records", () => {
  let called = false;
  const sink = getDolshoeSink({
    dolshoe: {
      captureException: () => {
        called = true;
        return undefined;
      },
      captureMessage: () => undefined,
      captureLog: () => {
        called = true;
        return undefined;
      },
      flush: async () => true,
      close: async () => true,
    },
  });

  sink(record({ category: ["logtape", "meta"], level: "info" }));

  assert.equal(called, false);
});

test("drops a record when beforeSend returns null", () => {
  let called = false;
  const sink = getDolshoeSink({
    dolshoe: {
      captureException: () => {
        called = true;
        return undefined;
      },
      captureMessage: () => {
        called = true;
        return undefined;
      },
      captureLog: () => {
        called = true;
        return undefined;
      },
      flush: async () => true,
      close: async () => true,
    },
    beforeSend: () => null,
  });

  sink(record());

  assert.equal(called, false);
});

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN_ID = "00f067aa0ba902b7";

function sinkCollecting(calls) {
  return getDolshoeSink({
    dolshoe: {
      captureException: (...args) => {
        calls.push(["exception", ...args]);
        return "event-id";
      },
      captureMessage: () => undefined,
      captureLog: (...args) => {
        calls.push(["log", ...args]);
        return "event-id";
      },
      startSpan: () => undefined,
      withSpan: (_name, run) => run(undefined),
      activeSpan: () => undefined,
      flush: async () => true,
      close: async () => true,
    },
  });
}

// A service already propagating W3C trace context through LogTape's implicit
// contexts gets correlated logs without adopting Dolshoe's span API.
test("lifts traceId and spanId out of LogTape properties into the trace context", () => {
  const calls = [];
  sinkCollecting(calls)(
    record({
      level: "info",
      properties: { orderId: "order-123", traceId: TRACE_ID, spanId: SPAN_ID },
    }),
  );

  const [, , , options] = calls[0];
  assert.deepEqual(options.trace, { traceId: TRACE_ID, spanId: SPAN_ID });
  // Not duplicated into the attributes, where they are about to be columns.
  assert.deepEqual(options.attributes, { orderId: "order-123" });
});

test("accepts a trace id without a span id", () => {
  const calls = [];
  sinkCollecting(calls)(record({ level: "info", properties: { traceId: TRACE_ID } }));

  assert.deepEqual(calls[0][3].trace, { traceId: TRACE_ID });
});

test("ignores properties that only look like trace ids", () => {
  const calls = [];
  sinkCollecting(calls)(
    record({ level: "info", properties: { traceId: "nope", spanId: "also-nope" } }),
  );

  assert.equal(calls[0][3].trace, undefined);
  // Left in the attributes, since they were not trace context after all.
  assert.deepEqual(calls[0][3].attributes, { traceId: "nope", spanId: "also-nope" });
});

test("carries the trace context onto a captured exception too", () => {
  const calls = [];
  sinkCollecting(calls)(
    record({ properties: { error: new TypeError("bad"), traceId: TRACE_ID, spanId: SPAN_ID } }),
  );

  const [kind, , options] = calls[0];
  assert.equal(kind, "exception");
  assert.deepEqual(options.trace, { traceId: TRACE_ID, spanId: SPAN_ID });
});
