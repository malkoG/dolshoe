import assert from "node:assert/strict";
import test from "node:test";

import { Client, parseDsn } from "../dist/index.mjs";

const TOKEN = "dsh_a1b2c3d4e5f6_TFhQb2xzaG9lRXhhbXBsZVNlY3JldFZhbHVlSGVyZQ";
const PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";
const DSN = `https://${TOKEN}@dolshoe.example/${PROJECT_ID}`;

test("derives both ingestion endpoints and the credential from a DSN", () => {
  const parsed = parseDsn(DSN);

  assert.equal(parsed.origin, "https://dolshoe.example");
  assert.equal(parsed.basePath, "");
  assert.equal(parsed.projectId, PROJECT_ID);
  assert.equal(parsed.token, TOKEN);
  assert.equal(
    parsed.errorReportEndpoint,
    `https://dolshoe.example/api/v1/projects/${PROJECT_ID}/error-reports`,
  );
  assert.equal(
    parsed.logEndpoint,
    `https://dolshoe.example/api/v1/projects/${PROJECT_ID}/log-records`,
  );
});

test("keeps a base path so an instance behind a prefix still works", () => {
  const parsed = parseDsn(`https://${TOKEN}@example.test/tools/dolshoe/${PROJECT_ID}`);

  assert.equal(parsed.basePath, "/tools/dolshoe");
  assert.equal(
    parsed.errorReportEndpoint,
    `https://example.test/tools/dolshoe/api/v1/projects/${PROJECT_ID}/error-reports`,
  );
});

test("accepts http and a non-default port for self-hosted instances without TLS", () => {
  const parsed = parseDsn(`http://${TOKEN}@localhost:5173/${PROJECT_ID}`);

  assert.equal(parsed.origin, "http://localhost:5173");
  assert.equal(
    parsed.errorReportEndpoint,
    `http://localhost:5173/api/v1/projects/${PROJECT_ID}/error-reports`,
  );
});

test("rejects a malformed DSN with a message naming the problem", () => {
  assert.throws(() => parseDsn(""), /must not be empty/);
  assert.throws(() => parseDsn("not a url"), /not a valid URL/);
  assert.throws(() => parseDsn(`ftp://${TOKEN}@dolshoe.example/${PROJECT_ID}`), /http or https/);
  assert.throws(
    () => parseDsn(`https://dolshoe.example/${PROJECT_ID}`),
    /missing its ingestion token/,
  );
  assert.throws(() => parseDsn(`https://${TOKEN}@dolshoe.example`), /missing its project id/);
  assert.throws(
    () => parseDsn(`https://${TOKEN}:secret@dolshoe.example/${PROJECT_ID}`),
    /no password component/,
  );
});

test("configures a client from a DSN alone", async () => {
  const requests = [];
  const client = new Client({
    dsn: DSN,
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

  assert.equal(
    requests[0].input,
    `https://dolshoe.example/api/v1/projects/${PROJECT_ID}/error-reports`,
  );
  assert.equal(requests[0].init.headers.authorization, `Bearer ${TOKEN}`);
});

test("sends log records to the endpoint the DSN derives", async () => {
  const requests = [];
  const client = new Client({
    dsn: DSN,
    service: { name: "checkout-api" },
    runtime: { name: "node" },
    reporter: { name: "dolshoe-node" },
    fetch: async (input, init) => {
      requests.push({ input, init });
      return new Response(null, { status: 201 });
    },
  });

  client.captureLog("info", "payment authorized");
  assert.equal(await client.flush(), true);

  assert.equal(
    requests[0].input,
    `https://dolshoe.example/api/v1/projects/${PROJECT_ID}/log-records`,
  );
  assert.equal(requests[0].init.headers.authorization, `Bearer ${TOKEN}`);
});

test("lets an explicit endpoint and authorization header override the DSN", async () => {
  const requests = [];
  const client = new Client({
    dsn: DSN,
    endpoint: "https://proxy.internal/ingest",
    headers: { authorization: "Bearer override" },
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

  assert.equal(requests[0].input, "https://proxy.internal/ingest");
  assert.equal(requests[0].init.headers.authorization, "Bearer override");
});

test("still refuses a client with no destination at all", () => {
  assert.throws(
    () =>
      new Client({
        service: { name: "checkout-api" },
        runtime: { name: "node" },
        reporter: { name: "dolshoe-node" },
      }),
    /requires either dsn, endpoint, or transport/,
  );
});
