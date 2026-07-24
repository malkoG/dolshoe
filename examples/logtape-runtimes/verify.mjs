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

function comparable(report) {
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
  };
}

const reports = Object.fromEntries(
  Object.entries(scenarios).map(([runtime, [command, arguments_]]) => [
    runtime,
    execute(runtime, command, arguments_),
  ]),
);

for (const runtime of Object.keys(scenarios)) {
  assert.equal(reports[runtime].runtime.name, runtime);
  assert.equal(typeof reports[runtime].runtime.version, "string");
  assert.equal(reports[runtime].reporter.name, `dolshoe-${runtime}`);
  assert.equal(reports[runtime].schemaVersion, 1);
  assert.equal(reports[runtime].eventId, "bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7");
  assert.equal(typeof reports[runtime].exception.stacktrace, "string");
  assert.ok(reports[runtime].exception.frames.length > 0);
  assert.equal(reports[runtime].exception.cause.message, "Cart was not loaded");
  assert.equal(reports[runtime].exception.children.length, 2);
}

assert.deepEqual(comparable(reports.deno), comparable(reports.node));
assert.deepEqual(comparable(reports.bun), comparable(reports.node));

// eslint-disable-next-line no-console
console.log("Node, Deno, and Bun produced equivalent Dolshoe V1 reports.");
