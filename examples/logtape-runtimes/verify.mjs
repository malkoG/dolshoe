import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const scenarios = {
  node: ["node", ["node.mjs"]],
  deno: ["deno", ["run", "deno.mjs"]],
  bun: ["bun", ["run", "bun.mjs"]],
};

function execute(runtime, command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: import.meta.dirname,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${runtime} scenario failed with status ${result.status}:\n${result.stderr}`);
  }

  const lines = result.stdout.trim().split("\n");
  return JSON.parse(lines.at(-1));
}

function normalizeException(exception) {
  const normalized = { ...exception };
  delete normalized.stacktrace;
  delete normalized.frames;
  if (normalized.cause) normalized.cause = normalizeException(normalized.cause);
  if (normalized.context) normalized.context = normalizeException(normalized.context);
  if (normalized.children) {
    normalized.children = normalized.children.map(normalizeException);
  }
  return normalized;
}

function comparableReport(report) {
  return {
    ...report,
    occurredAt: "<runtime timestamp>",
    runtime: {
      name: "<runtime>",
      version: "<runtime version>",
    },
    reporter: {
      name: "<runtime reporter>",
      version: report.reporter.version,
    },
    exception: normalizeException(report.exception),
    // Random per run, and already asserted structurally through `trace`.
    trace: report.trace == null ? undefined : "<active span>",
  };
}

function comparableLogRecord(record) {
  return {
    ...record,
    occurredAt: "<runtime timestamp>",
    runtime: {
      name: "<runtime>",
      version: "<runtime version>",
    },
    reporter: {
      name: "<runtime reporter>",
      version: record.reporter.version,
    },
    // Random per run, and already asserted structurally through `trace`.
    trace: record.trace == null ? undefined : "<active span>",
  };
}

function comparableTrace(trace) {
  return {
    ...trace,
    root: {
      ...trace.root,
      resource: trace.root.resource.attributes
        .filter((pair) => !pair.key.startsWith("process.runtime."))
        .map((pair) =>
          pair.key === "telemetry.sdk.name"
            ? { key: pair.key, value: { stringValue: "<runtime reporter>" } }
            : pair,
        ),
    },
  };
}

const results = Object.fromEntries(
  Object.entries(scenarios).map(([runtime, [command, arguments_]]) => [
    runtime,
    execute(runtime, command, arguments_),
  ]),
);

for (const runtime of Object.keys(scenarios)) {
  const reports = results[runtime];
  const report = reports.report;
  const logRecord = reports.logRecord;
  assert.equal(report.runtime.name, runtime);
  assert.equal(typeof report.runtime.version, "string");
  assert.equal(report.reporter.name, `dolshoe-${runtime}`);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.eventId, "bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7");
  assert.equal(typeof report.exception.stacktrace, "string");
  assert.ok(report.exception.frames.length > 0);
  assert.equal(report.exception.cause.message, "Cart was not loaded");
  assert.equal(report.exception.children.length, 2);

  assert.equal(logRecord.runtime.name, runtime);
  assert.equal(typeof logRecord.runtime.version, "string");
  assert.equal(logRecord.reporter.name, `dolshoe-${runtime}`);
  assert.equal(logRecord.eventId, "6608e55d-1b24-4d9a-951f-7e7211f92f44");
  assert.equal(logRecord.level, "info");
  assert.equal(logRecord.message, "Submitting order order-123");
  assert.deepEqual(logRecord.category, ["checkout", "orders"]);

  // Spans nest the same way on every runtime, and the log and the report both
  // landed on the span that was active when they were written — which, being
  // written either side of an await, is what proves each runtime tracks the
  // active span through async context rather than only synchronously.
  const trace = reports.trace;
  assert.equal(trace.root.name, "POST /orders");
  assert.equal(trace.root.kind, 2);
  assert.equal(trace.root.parentSpanId, null);
  assert.equal(trace.child.name, "authorize payment");
  assert.equal(trace.child.parent, "<root span>");
  assert.equal(trace.child.sameTrace, true);
  assert.deepEqual(trace.child.status, { code: 2, message: "payment was declined" });
  assert.equal(trace.logRecordSpan, "<root span>");
  assert.equal(trace.reportSpan, "<root span>");
}

assert.deepEqual(comparableReport(results.deno.report), comparableReport(results.node.report));
assert.deepEqual(comparableReport(results.bun.report), comparableReport(results.node.report));
assert.deepEqual(
  comparableLogRecord(results.deno.logRecord),
  comparableLogRecord(results.node.logRecord),
);
assert.deepEqual(
  comparableLogRecord(results.bun.logRecord),
  comparableLogRecord(results.node.logRecord),
);

assert.deepEqual(comparableTrace(results.deno.trace), comparableTrace(results.node.trace));
assert.deepEqual(comparableTrace(results.bun.trace), comparableTrace(results.node.trace));

// eslint-disable-next-line no-console
console.log("Node, Deno, and Bun produced equivalent Dolshoe reports, log records, and traces.");
