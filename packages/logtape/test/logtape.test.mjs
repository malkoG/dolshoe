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

test("routes error-level messages without Error properties to captureMessage", () => {
  const calls = [];
  const sink = getDolshoeSink({
    dolshoe: {
      captureException: () => undefined,
      captureMessage: (...args) => {
        calls.push(args);
        return "event-id";
      },
      flush: async () => true,
      close: async () => true,
    },
  });

  sink(record({ properties: { orderId: "order-123" } }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "Order order-123 failed");
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
  assert.deepEqual(calls, [
    [
      "info",
      "Order order-123 failed",
      {
        occurredAt: Date.parse("2026-07-24T08:30:00.000Z"),
        category: ["checkout", "orders"],
        attributes: {
          orderId: "order-123",
          error: record().properties.error,
        },
      },
    ],
  ]);
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
