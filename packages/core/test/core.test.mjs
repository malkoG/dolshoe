import assert from "node:assert/strict";
import test from "node:test";

import {
  Client,
  DEFAULT_STACK_FRAME_LIMIT,
  applyStackFrameLimit,
  attachSourceContext,
  createSynchronousScope,
  normalizeException,
  parseJavaScriptStack,
  sanitizeBreadcrumbs,
  sanitizeTags,
  sanitizeUser,
} from "../dist/index.mjs";

function testClient(overrides = {}) {
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
    ...overrides,
  });
  return { client, reports };
}

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
      origin: "app",
      async: true,
    },
    {
      fileName: "/srv/app/main.js",
      lineNumber: 10,
      columnNumber: 3,
      inApp: true,
      origin: "app",
    },
    {
      fileName: "node:internal/process/task_queues",
      lineNumber: 105,
      columnNumber: 5,
      inApp: false,
      origin: "runtime",
    },
  ]);
});

test("tells each runtime's own internals apart from a dependency", () => {
  const stack = [
    "Error: failed",
    "    at handler (/srv/app/routes.ts:8:5)",
    "    at Layer.handle (/srv/app/node_modules/express/lib/router/layer.js:95:5)",
    "    at serve (https://deno.land/std@0.224.0/http/server.ts:298:20)",
    "    at assertEquals (jsr:@std/assert@1.0.0/equals:32:9)",
    "    at ext:deno_web/06_streams.js:1024:11",
    "    at bun:main:14:3",
  ].join("\n");

  assert.deepEqual(
    parseJavaScriptStack(stack).map((frame) => [frame.fileName, frame.origin, frame.inApp]),
    [
      ["/srv/app/routes.ts", "app", true],
      ["/srv/app/node_modules/express/lib/router/layer.js", "dependency", false],
      ["https://deno.land/std@0.224.0/http/server.ts", "dependency", false],
      ["jsr:@std/assert@1.0.0/equals", "dependency", false],
      ["ext:deno_web/06_streams.js", "runtime", false],
      ["bun:main", "runtime", false],
    ],
  );
});

test("surrounds an application frame with the lines around it", () => {
  const source = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`);
  const frames = parseJavaScriptStack(
    [
      "Error: failed",
      "    at handle (/srv/app/handler.ts:8:3)",
      "    at Layer (/srv/app/node_modules/express/layer.js:4:1)",
      "    at run (node:internal/timers:9:1)",
    ].join("\n"),
  );

  attachSourceContext(frames, () => source);

  assert.equal(frames[0]?.sourceLine, "line 8");
  assert.deepEqual(frames[0]?.preContext, ["line 3", "line 4", "line 5", "line 6", "line 7"]);
  assert.deepEqual(frames[0]?.postContext, ["line 9", "line 10", "line 11", "line 12"]);

  // Only the application's own frames are read: a failure inside a library is
  // not diagnosed by reading that library, and 200 frames of context is a
  // payload nobody wants.
  assert.equal(frames[1]?.sourceLine, undefined);
  assert.equal(frames[2]?.sourceLine, undefined);
});

test("asks for no source when the reader has nothing, or the line is off the end", () => {
  const frames = parseJavaScriptStack("Error: failed\n    at handle (/srv/app/handler.ts:99:3)");

  attachSourceContext(frames, () => undefined);
  assert.equal(frames[0]?.sourceLine, undefined);

  attachSourceContext(frames, () => ["only one line"]);
  assert.equal(frames[0]?.sourceLine, undefined);
  assert.equal(frames[0]?.preContext, undefined);
});

function descend(depth) {
  if (depth === 0) throw new Error("bottom");
  descend(depth - 1);
}

test("raises the runtime's frame budget, and puts it back", () => {
  const before = Error.stackTraceLimit;

  const restore = applyStackFrameLimit(DEFAULT_STACK_FRAME_LIMIT);
  try {
    assert.equal(Error.stackTraceLimit, DEFAULT_STACK_FRAME_LIMIT);

    // The point of the limit, measured rather than asserted about: a stack
    // deeper than the runtime's default of 10 now arrives whole.
    let frames = [];
    try {
      descend(60);
    } catch (error) {
      frames = parseJavaScriptStack(error.stack);
    }

    assert.ok(frames.length > 10, `expected more than 10 frames, got ${frames.length}`);
  } finally {
    restore();
  }

  assert.equal(Error.stackTraceLimit, before);
});

test("keeps a frame it cannot place rather than leaving a hole", () => {
  const stack = [
    "Error: failed",
    "    at loadOrders (/srv/app/orders.ts:12:9)",
    "    at async Promise.all (index 0)",
    "    at <anonymous>",
    "    at listen (native)",
    "    at flush (/srv/app/flush.ts:3:1)",
  ].join("\n");

  const frames = parseJavaScriptStack(stack);

  // Every line survives, so a reader counting frames sees the real distance
  // between the two located ones.
  assert.equal(frames.length, 5);
  assert.deepEqual(frames[1], { functionName: "Promise.all (index 0)", async: true });
  assert.deepEqual(frames[2], { functionName: "<anonymous>" });
  assert.deepEqual(frames[3], {
    functionName: "listen",
    native: true,
    origin: "runtime",
    inApp: false,
  });
  assert.equal(frames[4]?.fileName, "/srv/app/flush.ts");
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

test("creates and batches structured V1 log records", async () => {
  const batches = [];
  const eventIds = ["6608e55d-1b24-4d9a-951f-7e7211f92f44", "b1a7f5ba-f9fd-4ebd-818f-8ce499273cac"];
  const client = new Client({
    endpoint: "https://dolshoe.example/api/v1/error-reports",
    service: {
      name: "checkout-api",
      environment: "production",
      release: "2026.07.25.1",
    },
    runtime: { name: "node", version: "24.0.0" },
    reporter: { name: "dolshoe-node", version: "0.1.0" },
    logTransport: {
      async send(records) {
        batches.push(records);
      },
    },
    generateEventId: () => eventIds.shift(),
    now: () => new Date("2026-07-25T05:30:01.123Z"),
  });

  const firstEventId = client.captureLog("info", "Payment authorization completed", {
    category: ["checkout", "payment"],
    trace: {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
    },
    attributes: {
      amount: 45_000,
      authorization: "do-not-send",
    },
  });
  client.captureLog("warning", "Payment response was slow");

  assert.equal(firstEventId, "6608e55d-1b24-4d9a-951f-7e7211f92f44");
  assert.equal(await client.flush(), true);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  assert.deepEqual(batches[0][0], {
    eventId: "6608e55d-1b24-4d9a-951f-7e7211f92f44",
    occurredAt: "2026-07-25T05:30:01.123Z",
    level: "info",
    message: "Payment authorization completed",
    category: ["checkout", "payment"],
    service: {
      name: "checkout-api",
      environment: "production",
      release: "2026.07.25.1",
    },
    runtime: { name: "node", version: "24.0.0" },
    reporter: { name: "dolshoe-node", version: "0.1.0" },
    trace: {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
    },
    attributes: {
      amount: 45_000,
      authorization: "[REDACTED]",
    },
  });
});

test("posts log batches through the default HTTP log transport", async () => {
  const requests = [];
  const client = new Client({
    endpoint: "https://dolshoe.example/api/v1/error-reports",
    logEndpoint: "https://dolshoe.example/api/v1/log-records",
    service: { name: "checkout-api" },
    runtime: { name: "node" },
    reporter: { name: "dolshoe-node" },
    fetch: async (input, init) => {
      requests.push({ input, init });
      return new Response(null, { status: 201 });
    },
  });

  client.captureLog("info", "worker started");
  client.captureLog("debug", "worker polling");

  assert.equal(await client.flush(), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input, "https://dolshoe.example/api/v1/log-records");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["content-type"], "application/json");
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.records.length, 2);
  assert.equal(body.records[0].message, "worker started");
});

test("splits log delivery into batches of at most 100 records", async () => {
  const batchSizes = [];
  const client = new Client({
    endpoint: "https://dolshoe.example/api/v1/error-reports",
    service: { name: "checkout-api" },
    runtime: { name: "node" },
    reporter: { name: "dolshoe-node" },
    logTransport: {
      async send(records) {
        batchSizes.push(records.length);
      },
    },
  });

  for (let index = 0; index < 101; index += 1) {
    client.captureLog("info", `record ${index}`);
  }

  assert.equal(await client.flush(), true);
  assert.deepEqual(batchSizes, [100, 1]);
});

test("lets beforeSendLogRecord transform or discard log records", async () => {
  const records = [];
  const client = new Client({
    endpoint: "https://dolshoe.example/api/v1/error-reports",
    service: { name: "checkout-api" },
    runtime: { name: "node" },
    reporter: { name: "dolshoe-node" },
    logTransport: {
      async send(batch) {
        records.push(...batch);
      },
    },
    beforeSendLogRecord: (record) =>
      record.level === "debug" ? null : { ...record, attributes: { transformed: true } },
  });

  client.captureLog("debug", "discarded");
  client.captureLog("info", "kept");

  assert.equal(await client.flush(), true);
  assert.equal(records.length, 1);
  assert.equal(records[0].message, "kept");
  assert.deepEqual(records[0].attributes, { transformed: true });
});

test("requires an explicit log transport boundary", () => {
  const client = new Client({
    endpoint: "https://dolshoe.example/api/v1/error-reports",
    service: { name: "checkout-api" },
    runtime: { name: "node" },
    reporter: { name: "dolshoe-node" },
  });

  assert.throws(
    () => client.captureLog("info", "cannot be delivered"),
    /requires logEndpoint or logTransport/,
  );
});

test("sanitizeUser trims fields, bounds their length, and drops an empty user", () => {
  assert.deepEqual(sanitizeUser({ id: "  u_42  ", email: "a@example.com" }), {
    id: "u_42",
    email: "a@example.com",
  });
  assert.equal(sanitizeUser({}), undefined);
  assert.equal(sanitizeUser(undefined), undefined);
  assert.equal(sanitizeUser({ id: "x".repeat(500) }).id.length, 200);
});

test("sanitizeTags bounds entry count, key/value length, and drops non-string values", () => {
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, `v${i}`]));
  assert.equal(Object.keys(sanitizeTags(many)).length, 20);

  assert.deepEqual(sanitizeTags({ tier: "enterprise", empty: "", bad: 42 }), {
    tier: "enterprise",
  });
  assert.equal(sanitizeTags(undefined), undefined);
});

test("sanitizeBreadcrumbs keeps only the newest 100 and bounds each entry", () => {
  const many = Array.from({ length: 150 }, (_, i) => ({
    timestamp: "2026-07-24T08:00:00.000Z",
    message: `event ${i}`,
  }));
  const sanitized = sanitizeBreadcrumbs(many);
  assert.equal(sanitized.length, 100);
  assert.equal(sanitized[0].message, "event 50");
  assert.equal(sanitized[99].message, "event 149");

  assert.deepEqual(
    sanitizeBreadcrumbs([
      {
        timestamp: "2026-07-24T08:00:00.000Z",
        message: "clicked",
        category: "ui",
        level: "info",
        data: { button: "checkout" },
      },
    ]),
    [
      {
        timestamp: "2026-07-24T08:00:00.000Z",
        message: "clicked",
        category: "ui",
        level: "info",
        data: { button: "checkout" },
      },
    ],
  );

  assert.equal(sanitizeBreadcrumbs(undefined), undefined);
  assert.equal(sanitizeBreadcrumbs([]), undefined);
});

test("sanitizeBreadcrumbs drops a data bag too large to send", () => {
  // Each value alone survives the 4096-char per-value truncation `sanitizeJsonValue`
  // already applies; only the whole bag's serialized size (> 8192 bytes) is over
  // the breadcrumb-specific cap, which is what this test is actually exercising.
  const large = Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => [`field${i}`, "x".repeat(4_000)]),
  );
  const [breadcrumb] = sanitizeBreadcrumbs([
    { timestamp: "2026-07-24T08:00:00.000Z", data: large },
  ]);
  assert.equal(breadcrumb.data, undefined);
});

test("createSynchronousScope mutates in place without run(), and run() isolates and restores", () => {
  const scope = createSynchronousScope();
  scope.active().tags.tier = "enterprise";
  assert.deepEqual(scope.active().tags, { tier: "enterprise" });

  scope.run({ tags: {}, breadcrumbs: [] }, () => {
    assert.deepEqual(scope.active().tags, {});
    scope.active().tags.tier = "trial";
    assert.deepEqual(scope.active().tags, { tier: "trial" });
  });

  assert.deepEqual(scope.active().tags, { tier: "enterprise" });
});

test("attaches the ambient scope's user, tags, and breadcrumbs to a captured report", async () => {
  const { client, reports } = testClient();

  client.setUser({ id: "u_1", email: "a@example.com" });
  client.setTag("tier", "enterprise");
  client.addBreadcrumb({ message: "opened checkout", category: "navigation" });
  client.captureException(new Error("failed"));

  await client.flush();
  assert.equal(reports.length, 1);
  assert.deepEqual(reports[0].user, { id: "u_1", email: "a@example.com" });
  assert.deepEqual(reports[0].tags, { tier: "enterprise" });
  assert.equal(reports[0].breadcrumbs.length, 1);
  assert.equal(reports[0].breadcrumbs[0].message, "opened checkout");
});

test("a per-call user replaces the ambient one, and per-call tags win on collision", async () => {
  const { client, reports } = testClient();

  client.setUser({ id: "ambient-user" });
  client.setTag("tier", "trial");
  client.setTag("region", "apac");
  client.captureException(new Error("failed"), {
    user: { id: "explicit-user" },
    tags: { tier: "enterprise" },
  });

  await client.flush();
  assert.deepEqual(reports[0].user, { id: "explicit-user" });
  assert.deepEqual(reports[0].tags, { tier: "enterprise", region: "apac" });
});

test("addBreadcrumb caps the ring buffer at 100 as breadcrumbs accumulate", async () => {
  const { client, reports } = testClient();

  for (let i = 0; i < 150; i++) {
    client.addBreadcrumb({ message: `event ${i}` });
  }
  client.captureException(new Error("failed"));

  await client.flush();
  assert.equal(reports[0].breadcrumbs.length, 100);
  assert.equal(reports[0].breadcrumbs[0].message, "event 50");
  assert.equal(reports[0].breadcrumbs[99].message, "event 149");
});

test("withScope isolates user, tags, and breadcrumbs set during it", async () => {
  const { client, reports } = testClient();

  client.setTag("outer", "yes");
  client.withScope(() => {
    client.setTag("inner", "yes");
    client.setUser({ id: "scoped-user" });
    client.captureException(new Error("inside scope"));
  });
  client.captureException(new Error("outside scope"));

  await client.flush();
  assert.equal(reports.length, 2);
  assert.deepEqual(reports[0].tags, { inner: "yes" });
  assert.deepEqual(reports[0].user, { id: "scoped-user" });
  assert.deepEqual(reports[1].tags, { outer: "yes" });
  assert.equal(reports[1].user, undefined);
});

test("clearing the user with null removes it from later reports", async () => {
  const { client, reports } = testClient();

  client.setUser({ id: "u_1" });
  client.setUser(null);
  client.captureException(new Error("failed"));

  await client.flush();
  assert.equal(reports[0].user, undefined);
});
