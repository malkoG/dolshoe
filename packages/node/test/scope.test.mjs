import assert from "node:assert/strict";
import test from "node:test";

import { init, close } from "../dist/index.mjs";

function collectingClient() {
  const reports = [];
  const client = init({
    service: { name: "checkout-api" },
    transport: {
      async send(report) {
        reports.push(report);
      },
    },
    captureUnhandledErrors: false,
  });
  return { client, reports };
}

/**
 * The reason `@dolshoe/node` installs its own scope rather than using core's
 * synchronous fallback: with one shared object, a user or tag set while
 * handling one request would leak into whichever other request read it next.
 */
test("two concurrent requests do not see each other's user or tags", async () => {
  const { client, reports } = collectingClient();

  async function handle(userId, delay) {
    return client.withScope(async () => {
      client.setUser({ id: userId });
      client.setTag("request", userId);
      await new Promise((resolve) => setTimeout(resolve, delay));
      client.captureException(new Error(`failed for ${userId}`));
    });
  }

  // Interleaved on purpose: the second request sets its user while the first
  // is still awaiting.
  await Promise.all([handle("user-a", 30), handle("user-b", 10)]);
  await client.flush();

  const byMessage = Object.fromEntries(reports.map((report) => [report.exception.message, report]));

  assert.deepEqual(byMessage["failed for user-a"].user, { id: "user-a" });
  assert.deepEqual(byMessage["failed for user-a"].tags, { request: "user-a" });
  assert.deepEqual(byMessage["failed for user-b"].user, { id: "user-b" });
  assert.deepEqual(byMessage["failed for user-b"].tags, { request: "user-b" });

  await close();
});

test("setUser/setTag/addBreadcrumb called before any withScope still work", async () => {
  const { client, reports } = collectingClient();

  client.setUser({ id: "startup-user" });
  client.addBreadcrumb({ message: "app started" });
  client.captureException(new Error("failed"));

  await client.flush();
  assert.deepEqual(reports[0].user, { id: "startup-user" });
  assert.equal(reports[0].breadcrumbs[0].message, "app started");

  await close();
});
