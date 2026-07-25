# Dolshoe

Dolshoe is a simple, self-hosted error reporting and stack tracing service.
It favors a small implementation and an easy deployment story over external
search engines or a large infrastructure footprint.

The project currently contains the minimum backend foundation: a NestJS API,
Prisma, PostgreSQL, a PostgreSQL-backed message queue, structured logging with
LogTape, and a database-aware health endpoint.

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
pnpm docker:up
pnpm db:migrate
pnpm dev
```

The API is available at `http://localhost:3000`. Verify it with:

```sh
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-07-24T00:00:00.000Z"
}
```

Stop the development database with:

```sh
pnpm docker:down
```

The named development volume is kept when the container stops.

## Workspace

```text
apps/
└── api/
    ├── prisma/       Prisma schema and migrations
    ├── src/
    │   ├── config/
    │   ├── database/
    │   ├── health/
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
  service: {
    name: "checkout-api",
    environment: "production",
    release: "2026.07.24.1",
  },
});

Dolshoe.captureException(new Error("Checkout failed"));
await Dolshoe.flush();
```

Use `@dolshoe/deno` or `@dolshoe/bun` in those runtimes. Global uncaught error
capture is enabled by default and can be disabled with
`captureUnhandledErrors: false`. Call `close()` during graceful application
shutdown to remove runtime hooks and flush queued reports.

LogTape remains responsible for logger configuration. The Dolshoe bridge only
translates error records into calls to the selected runtime SDK:

```ts
import { configure } from "@logtape/logtape";
import { getDolshoeSink } from "@dolshoe/logtape";
import * as Dolshoe from "@dolshoe/node";

Dolshoe.init({
  endpoint: "https://dolshoe.example/api/v1/error-reports",
  service: { name: "checkout-api" },
});

await configure({
  sinks: {
    dolshoe: getDolshoeSink({ dolshoe: Dolshoe }),
  },
  loggers: [{ category: [], sinks: ["dolshoe"], lowestLevel: "error" }],
});
```

The bridge checks structured `error` and `err` properties by default. An
`Error` is sent through `captureException`; error-level records without an
`Error` use `captureMessage`.

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

PostgreSQL is the only supported database. The default development database
runs on port `5432`; the isolated test database runs on port `5433`.

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

| Variable       | Default in `.env.example` | Description                            |
| -------------- | ------------------------- | -------------------------------------- |
| `NODE_ENV`     | `development`             | `development`, `test`, or `production` |
| `PORT`         | `3000`                    | HTTP listen port                       |
| `LOG_LEVEL`    | `debug`                   | Minimum LogTape level                  |
| `DATABASE_URL` | local PostgreSQL          | Prisma and application connection URL  |

Development logs use a readable colored formatter. Production logs are emitted
as JSON Lines.

## License

[MIT](LICENSE)
