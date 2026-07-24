import assert from "node:assert/strict";
import test from "node:test";

import { Client, normalizeException, parseJavaScriptStack } from "../dist/index.mjs";

test("normalizes Error cause and AggregateError children", () => {
  const cause = new Error("cart missing");
  const error = new AggregateError(
    [new TypeError("invalid order"), "plain rejection"],
    "checkout failed",
    { cause },
  );
  const normalized = normalizeException(error);

  assert.equal(normalized.type, "AggregateError");
  assert.equal(normalized.message, "checkout failed");
  assert.equal(normalized.cause?.message, "cart missing");
  assert.equal(normalized.children?.[0]?.type, "TypeError");
  assert.deepEqual(normalized.children?.[1]?.value, {
    type: "string",
    representation: "plain rejection",
  });
});

test("parses V8-style Node, Deno, and Bun stack frames", () => {
  const stack = [
    "Error: failed",
    "    at async submitOrder (file:///srv/app/order.ts:42:18)",
    "    at /srv/app/main.js:10:3",
    "    at node:internal/process/task_queues:105:5",
  ].join("\n");

  assert.deepEqual(parseJavaScriptStack(stack), [
    {
      functionName: "submitOrder",
      fileName: "file:///srv/app/order.ts",
      lineNumber: 42,
      columnNumber: 18,
      inApp: true,
      async: true,
    },
    {
      fileName: "/srv/app/main.js",
      lineNumber: 10,
      columnNumber: 3,
      inApp: true,
    },
    {
      fileName: "node:internal/process/task_queues",
      lineNumber: 105,
      columnNumber: 5,
      inApp: false,
    },
  ]);
});

test("creates a V1 report and redacts sensitive attributes", async () => {
  const reports = [];
  const client = new Client({
    service: { name: "checkout-api", environment: "test" },
    runtime: { name: "node", version: "24.0.0" },
    reporter: { name: "dolshoe-node", version: "0.1.0" },
    transport: {
      async send(report) {
        reports.push(report);
      },
    },
    generateEventId: () => "bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7",
    now: () => new Date("2026-07-24T08:30:00.000Z"),
  });

  client.captureException(new Error("failed"), {
    attributes: {
      route: "/orders",
      password: "do-not-send",
      nested: { apiKey: "do-not-send" },
    },
  });

  assert.equal(await client.flush(), true);
  assert.equal(reports.length, 1);
  assert.deepEqual(reports[0].attributes, {
    route: "/orders",
    password: "[REDACTED]",
    nested: { apiKey: "[REDACTED]" },
  });
  assert.equal(reports[0].schemaVersion, 1);
});

test("posts reports through the default HTTP transport", async () => {
  const requests = [];
  const client = new Client({
    endpoint: "https://dolshoe.example/api/v1/error-reports",
    service: { name: "checkout-api" },
    runtime: { name: "node" },
    reporter: { name: "dolshoe-node" },
    fetch: async (input, init) => {
      requests.push({ input, init });
      return new Response(null, { status: 201 });
    },
  });

  client.captureMessage("worker stopped");

  assert.equal(await client.flush(), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input, "https://dolshoe.example/api/v1/error-reports");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["content-type"], "application/json");
  assert.equal(JSON.parse(requests[0].init.body).exception.message, "worker stopped");
});
