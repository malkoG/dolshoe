# Dolshoe

<p align="center">
  <img src="./apps/web/public/dolshoe-mascot.png" alt="Dolshoe mascot holding an error alert" width="320">
</p>

Dolshoe takes its name from “돌쇠,” reimagined here as a dependable helper who
catches software errors and carries the load.

Dolshoe is a simple, self-hosted error reporting and stack tracing service.
It favors a small implementation and an easy deployment story over external
search engines or a large infrastructure footprint.

The project currently contains a NestJS ingestion API, Prisma, PostgreSQL, a
PostgreSQL-backed message queue, runtime reporting SDKs, structured logging
with LogTape, and a database-aware health endpoint.

## Requirements

- [mise](https://mise.jdx.dev/)
- Docker with Docker Compose

Node.js, pnpm, Deno, and Bun are pinned in `mise.toml`; no global NestJS or
Prisma CLI is required.

## Quick start

```sh
mise install
cp .env.example .env
pnpm install
docker compose up
```

`docker compose up` is the primary way to run the full stack: it starts
PostgreSQL, applies pending migrations, and runs the API and web dev servers
with hot reload. `pnpm install` is only for host-side tooling (linting, type
checking, host-run tests); each app installs its own dependencies inside its
container image.

PostgreSQL and the API are intentionally kept off the host network. Browser
traffic reaches the API through the web dev server's proxy, so only `web` is
published — on a loopback-only, Docker-assigned port by default, to avoid
colliding with other projects. Look it up once containers are up:

```sh
docker compose port web 5173
```

Open `http://localhost:<port>` in a browser, and verify the API through the
same origin:

```sh
curl http://localhost:<port>/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-07-24T00:00:00.000Z"
}
```

To use a stable, predictable port instead of the Docker-assigned one, set
`DOLSHOE_WEB_PORT` (uncomment it in `.env`, or pass it inline):

```sh
DOLSHOE_WEB_PORT=5173 docker compose up
```

If that port is already taken by another process, Compose fails immediately
with a clear "address already in use" error rather than silently falling back
to a different port — pick another value and retry.

### Rebuilds, logs, and shutdown

Rebuild the dev image after changing `Dockerfile.dev`, the pnpm lockfile, or a
workspace `package.json`:

```sh
docker compose up --build
```

Editing files under `apps/api/src` or `apps/web/src` does not need a rebuild:
both are bind-mounted into their containers, so the API watcher restarts and
Vite's HMR updates the browser directly.

Follow a single service's logs:

```sh
docker compose logs -f api
docker compose logs -f web
```

Stop the stack while keeping its data:

```sh
docker compose down
```

This removes the containers but keeps the named volumes (`postgres-data`,
`api-node-modules`, `web-node-modules`), so the database and installed
dependencies survive the next `docker compose up`. Only add `-v` when you
intentionally want to discard that data.

### Running multiple checkouts at once

Compose derives its project name from the current directory by default, so
running `docker compose up` from separate clones or worktrees — each in its
own directory — gets its own isolated networks, volumes, and containers with
no extra configuration, and stacks can run concurrently without port,
network, or volume collisions. To pin an explicit, shared name instead (for
example, if two checkouts happen to share a directory name), set
`COMPOSE_PROJECT_NAME` or pass `-p <name>` to `docker compose`.

## Workspace

```text
apps/
└── api/
    ├── prisma/       Prisma schema and migrations
    ├── src/
    │   ├── config/
    │   ├── database/
    │   ├── error-reporting/
    │   ├── health/
    │   ├── ingestion/
    │   ├── log-recording/
    │   ├── logging/
    │   └── message-queue/
    └── test/
packages/
├── core/             Runtime-neutral JavaScript report DTO and client
├── node/             Node.js reporter
├── deno/             Deno reporter
├── bun/              Bun reporter
└── logtape/          LogTape-to-Dolshoe bridge
examples/
└── logtape-runtimes/  Equivalent Node, Deno, and Bun reporting scenarios
```

Prisma remains inside the API because it has only one consumer. The reporter
packages share the versioned ingestion contract because Node, Deno, and Bun are
concrete consumers of the same payload.

## JavaScript reporters

Applications select their runtime package explicitly. Runtime packages own
exception normalization, runtime metadata, transport, global error hooks, and
flush behavior:

```ts
import * as Dolshoe from "@dolshoe/node";

Dolshoe.init({
  endpoint: "https://dolshoe.example/api/v1/error-reports",
  logEndpoint: "https://dolshoe.example/api/v1/log-records",
  service: {
    name: "checkout-api",
    environment: "production",
    release: "2026.07.24.1",
  },
  headers: {
    authorization: `Bearer ${process.env.DOLSHOE_INGEST_TOKEN}`,
  },
});

Dolshoe.captureException(new Error("Checkout failed"));
Dolshoe.captureLog("info", "Payment authorization completed", {
  category: ["checkout", "payment"],
  attributes: {
    paymentMethod: "card",
    amount: 45_000,
    currency: "KRW",
  },
});
await Dolshoe.flush();
```

Use `@dolshoe/deno` or `@dolshoe/bun` in those runtimes. Global uncaught error
capture is enabled by default and can be disabled with
`captureUnhandledErrors: false`. Call `close()` during graceful application
shutdown to remove runtime hooks and flush queued reports and log records.

`captureLog()` is exposed consistently by the Node.js, Deno, and Bun packages.
It accepts the levels `trace`, `debug`, `info`, `warning`, `error`, and `fatal`.
The SDK fills in the event ID, timestamp, service, runtime, and reporter fields,
redacts sensitive structured attributes, and sends records to `logEndpoint` in
batches of at most 100. Configure `beforeSendLogRecord` to transform or discard
individual records before they are queued. Custom transports can be supplied
with `logTransport`.

LogTape remains responsible for logger configuration. The Dolshoe bridge
routes error records into error reports and lower-severity records into
structured log batches:

```ts
import { configure } from "@logtape/logtape";
import { getDolshoeSink } from "@dolshoe/logtape";
import * as Dolshoe from "@dolshoe/node";

Dolshoe.init({
  endpoint: "https://dolshoe.example/api/v1/error-reports",
  logEndpoint: "https://dolshoe.example/api/v1/log-records",
  service: { name: "checkout-api" },
  headers: {
    authorization: `Bearer ${process.env.DOLSHOE_INGEST_TOKEN}`,
  },
});

await configure({
  sinks: {
    dolshoe: getDolshoeSink({ dolshoe: Dolshoe }),
  },
  loggers: [{ category: [], sinks: ["dolshoe"], lowestLevel: "info" }],
});
```

The bridge checks structured `error` and `err` properties by default. Error and
fatal records containing an `Error` use the existing error-report endpoint so
their stack traces remain first-class. All other records use `captureLog()` and
retain their LogTape level, category, timestamp, and structured properties,
and are sent to `/api/v1/log-records` in batches of up to 100. `flush()` and
`close()` send any partial batch immediately. LogTape's own meta logger
(`logtape.meta`) is never forwarded, avoiding feedback loops.

Applications can also capture a structured record directly:

```ts
Dolshoe.captureLog("info", "Payment authorization completed", {
  category: ["checkout", "payment"],
  attributes: {
    "payment.method": "card",
    "payment.amount": 45_000,
    "payment.currency": "KRW",
  },
});
```

Configure `logEndpoint` explicitly when structured logs are enabled. Log
requests are limited to 1 MiB and each batch is validated atomically.

## Message queue

The API exposes an internal, at-least-once `MessageQueue` contract. Application
code depends on that abstract class, while `PostgresMessageQueue` provides the
current implementation through Nest dependency injection.

Messages follow a lease-based lifecycle:

1. `enqueue` stores a JSON payload, optionally with a queue-scoped
   deduplication key or future availability time.
2. `claim` atomically leases available messages with PostgreSQL
   `FOR UPDATE SKIP LOCKED`.
3. The consumer calls `acknowledge` after success or `retry` after failure.
4. An expired lease becomes claimable by another consumer. Its stale lease
   token cannot acknowledge or retry the newer delivery.

Acknowledged messages are deleted. Delivery is therefore at least once, and
handlers must remain idempotent. The contract lives in
`apps/api/src/message-queue/message-queue.contract.ts`; consumers should inject
`MessageQueue` rather than the PostgreSQL implementation.

## Database workflow

PostgreSQL is the only supported database. The development database is
reachable only from other containers on the Compose network, at
`postgres:5432`; the isolated test database is published to the host at
`localhost:5433` for local tooling.

After changing `apps/api/prisma/schema.prisma`, create and apply a migration:

```sh
pnpm db:migrate -- --name describe_the_change
```

Commit both the schema change and the generated migration. Existing migrations
are immutable once shared. Production and CI environments apply committed
migrations with:

```sh
pnpm db:migrate:deploy
```

Useful database commands:

| Command                            | Purpose                                            |
| ---------------------------------- | -------------------------------------------------- |
| `pnpm db:generate`                 | Generate the Prisma Client                         |
| `pnpm db:validate`                 | Validate the Prisma schema                         |
| `pnpm db:format`                   | Format the Prisma schema                           |
| `pnpm db:push`                     | Prototype a schema without creating a migration    |
| `pnpm db:pull`                     | Introspect the configured database                 |
| `pnpm db:migrate -- --name <name>` | Create a development migration                     |
| `pnpm db:migrate:deploy`           | Apply committed migrations                         |
| `pnpm db:seed`                     | Run the intentionally empty seed entry point       |
| `pnpm db:studio`                   | Open Prisma Studio                                 |
| `pnpm db:reset`                    | **Delete development data and reapply migrations** |

`db:push` is useful for short experiments, but durable schema changes should
use migrations.

## Testing

```sh
pnpm test:unit       # Fast and database-free
pnpm test:e2e        # Reuses the dedicated PostgreSQL test container
pnpm test            # Unit and e2e tests
pnpm test:e2e:cold   # Stops the test DB first, then measures a cold run
pnpm test:coverage
pnpm sdk:test:runtimes # Compare Node, Deno, and Bun V1 report payloads
```

The test database uses an in-memory Docker `tmpfs` and is kept running between
local e2e runs. A test run starts it if necessary, waits for readiness, applies
migrations once, and then runs Jest. The test architecture has a two-minute
cold-start budget; the current health-only suite should be substantially
faster.

To manage the test database manually:

```sh
pnpm db:test:up
pnpm db:test:logs
pnpm db:test:reset
pnpm db:test:down
```

`db:test:reset` destroys all data in the dedicated `dolshoe_test` database.
The test credentials and port are intentionally committed in `.env.test` and
must never point at a shared or production database.

## Quality commands

```sh
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm typecheck
pnpm build
pnpm check
```

`pnpm check` runs formatting, linting, type checking, unit tests, and the
production build. CI additionally runs the PostgreSQL e2e suite.

## Configuration

| Variable             | Default in `.env.example` | Description                                       |
| -------------------- | ------------------------- | ------------------------------------------------- |
| `NODE_ENV`           | `development`             | `development`, `test`, or `production`            |
| `PORT`               | `3000`                    | HTTP listen port                                  |
| `LOG_LEVEL`          | `debug`                   | Minimum LogTape level                             |
| `INGEST_TOKEN`       | empty                     | Bearer token; required when `NODE_ENV=production` |
| `LOG_RETENTION_DAYS` | `14`                      | Days to retain logs, based on server receipt time |
| `DATABASE_URL`       | local PostgreSQL          | Prisma and application connection URL             |

Development logs use a readable colored formatter. Production logs are emitted
as JSON Lines. When configured, the same ingestion bearer token protects both
`/api/v1/error-reports` and `/api/v1/log-records`. Request bodies and tokens are
never written to the API's operational logs.

## License

[MIT](LICENSE)
