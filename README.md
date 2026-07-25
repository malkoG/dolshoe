# Dolshoe

Dolshoe is a simple, self-hosted error reporting and stack tracing service.
It favors a small implementation and an easy deployment story over external
search engines or a large infrastructure footprint.

The project currently contains the minimum backend foundation: a NestJS API,
Prisma, PostgreSQL, structured logging with LogTape, and a database-aware
health endpoint.

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
    │   └── logging/
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

LogTape remains responsible for logger configuration. The Dolshoe bridge only
translates records into calls to the selected runtime SDK:

```ts
import { configure } from "@logtape/logtape";
import { getDolshoeSink } from "@dolshoe/logtape";
import * as Dolshoe from "@dolshoe/node";

Dolshoe.init({
  endpoint: "https://dolshoe.example/api/v1/error-reports",
  logEndpoint: "https://dolshoe.example/api/v1/log-records",
  service: { name: "checkout-api" },
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
retain their LogTape level, category, timestamp, and structured properties.

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
