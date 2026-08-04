# Dolshoe

<p align="center">
  <img src="./apps/web/public/dolshoe-logo.svg" alt="Dolshoe" width="360">
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
    │   ├── auth/
    │   ├── config/
    │   ├── credentials/
    │   ├── database/
    │   ├── error-reporting/
    │   ├── health/
    │   ├── ingestion/
    │   ├── log-recording/
    │   ├── logging/
    │   ├── message-queue/
    │   └── organizations/
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

## Organizations and viewers

An **organization** is the tenant. It owns projects, and through them every event
reported into them. People reach it by signing in: a **membership** ties an
account to an organization and carries one of three roles.

| Role   | Can do                                                                          |
| ------ | ------------------------------------------------------------------------------- |
| Owner  | Everything, including managing members and granting ownership.                  |
| Admin  | Create projects, issue and revoke ingestion tokens, manage members below owner. |
| Member | Read the organization's projects, reports, logs, and token list.                |

Every instance starts with one organization, `default`, owning one project, also
`default`. Upgrading an existing instance moves every project it already had into
that organization, so nothing moves out from under you.

### Signing in with GitHub

GitHub is the only way to sign in. There are no passwords to store, reset, or
leak, and no second identity for your team to remember — the accounts they
already use to write the code are the accounts that read its errors.

Dolshoe asks GitHub for `read:user` and `user:email`, both read-only. It never
asks for repository access.

#### 1. Decide the callback URL

This is the one value worth getting right first, because GitHub has to be told
the same string you configure, character for character. It is always your
instance's public origin followed by `/api/v1/auth/github/callback`:

```text
https://dolshoe.example.com/api/v1/auth/github/callback
```

It must be an address a **browser** can reach. That is the web app's origin, not
the API's — the API is deliberately kept off the host network, and browser
traffic reaches it through the web server's `/api` proxy.

> [!IMPORTANT]
> **Locally, pin the port first.** `docker compose up` publishes the web app on
> a Docker-assigned port by default, which changes between runs and would
> invalidate your callback URL every time. Set `DOLSHOE_WEB_PORT` in `.env`
> before registering the app:
>
> ```sh
> DOLSHOE_WEB_PORT=5173
> ```
>
> Then the callback URL is `http://localhost:5173/api/v1/auth/github/callback`.

#### 2. Register the OAuth app

On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
For an app owned by a team rather than by you personally, register it under the
organization instead: **your org → Settings → Developer settings → OAuth Apps**.

| Field                      | What to enter                                                 |
| -------------------------- | ------------------------------------------------------------- |
| Application name           | Anything your team will recognize on the authorization screen |
| Homepage URL               | Your instance's origin, e.g. `http://localhost:5173`          |
| Authorization callback URL | The URL from step 1, exactly                                  |

Create it, then **Generate a new client secret**. GitHub shows the secret once.

An _OAuth App_, not a _GitHub App_ — the two are different products in the same
menu. Dolshoe only needs to identify a person, which is what OAuth Apps do, and
a GitHub App carries an installation model that would buy nothing here.

#### 3. Set the three variables

```sh
GITHUB_CLIENT_ID=Iv1.0123456789abcdef
GITHUB_CLIENT_SECRET=…
GITHUB_CALLBACK_URL=http://localhost:5173/api/v1/auth/github/callback
```

All three go together: set all of them or none. A partial set is refused at
startup, because the alternative is a redirect that fails much later with
nothing useful to say. Without any of them the API still starts, warns, and the
sign-in page explains that nobody can sign in yet.

#### 4. Restart and sign in

Configuration is read once at startup, so restart the API after editing `.env`:

```sh
docker compose restart api
```

Open the web app and choose **Continue with GitHub**. On a fresh instance the
first account through claims it — see [Claiming a new
instance](#claiming-a-new-instance) before exposing it to anyone else.

#### When it does not work

| What you see                                          | Why                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GitHub says "redirect_uri is not associated"          | `GITHUB_CALLBACK_URL` and the registered callback differ. Scheme, host, port, and path all have to match |
| Back at sign-in, "not configured"                     | One or more of the three variables is unset, or the API has not been restarted since they were           |
| Back at sign-in, "took too long or started elsewhere" | The `state` cookie expired (10 minutes) or was not returned. Just start again                            |
| Back at sign-in, "not on this instance's allowlist"   | `GITHUB_ALLOWED_LOGINS` is set and does not name that login                                              |
| Back at sign-in, "no access to this instance"         | The instance is already claimed and that account has no invitation                                       |
| Signing in appears to succeed but you stay signed out | A `Secure` session cookie over plain HTTP. See `SESSION_COOKIE_SECURE`                                   |
| The callback 404s                                     | The callback URL points at the API's own origin rather than the web app's                                |

To rotate the client secret, generate a new one on GitHub, update
`GITHUB_CLIENT_SECRET`, and restart. Existing sessions are unaffected — the
secret is only used while completing a sign-in, never afterwards.

### Deciding who gets in

Two independent gates. `GITHUB_ALLOWED_LOGINS` decides who may hold an account
at all; invitations decide which organizations that account reaches.

```sh
GITHUB_ALLOWED_LOGINS=octocat,malkoG
```

Leave it unset for no restriction. Set it before the instance is reachable and
you never have to race anyone to it.

### Claiming a new instance

A fresh instance has no accounts, and nobody to send an invitation. So the first
GitHub account to sign in becomes the owner of the default organization, and
every account after that needs an invitation.

> [!IMPORTANT]
> **An unclaimed instance is claimed by whichever allowed GitHub account reaches
> it first.** Set `GITHUB_ALLOWED_LOGINS`, or sign in as soon as the instance is
> up — and immediately after `pnpm db:migrate:deploy` when upgrading one that was
> already running, because an upgraded instance is unclaimed until someone does.
> The API logs a warning at startup for as long as it stays that way.
>
> This is narrower than what it replaces: before viewer auth, anyone who could
> reach the API could mint an ingestion token for any project, indefinitely.

### Adding people

Everyone after the first arrives by invitation. An owner or admin invites a
**GitHub login** from the **Members** screen and gets back a one-time link.

The API underneath needs a signed-in session. Signing in is a round trip through
github.com, so `curl` cannot start one — sign in through the web app and copy the
`dolshoe_session` cookie out of your browser for the examples in this README:

```sh
cookies="dolshoe_session=dsv_…"

curl -b "$cookies" -X POST http://localhost:<port>/api/v1/orgs/<orgSlug>/invitations \
  -H 'content-type: application/json' -d '{"githubLogin":"octocat","role":"MEMBER"}'
```

A login rather than an address, because a login is the identity the invitee will
actually arrive with. It is resolved to GitHub's immutable account id when the
link is redeemed, so a handle that changes hands in the meantime cannot be used
to claim somebody else's seat.

**Dolshoe sends no email.** There is no SMTP to configure, no delivery queue,
and no bounces to chase — you copy the link into whatever you already use to
talk to your colleagues. Like an ingestion token, the link is shown once and
only its digest is stored, so a link that is not recorded at that moment has to
be reissued.

Links expire after seven days, can be withdrawn at any time, and work exactly
once. Opening one signs the invitee in with GitHub and grants the membership in
a single step. Acceptance is bound to the login the invitation names, so
forwarding a link does not quietly add whoever opens it. Re-inviting the same
login withdraws any outstanding link for it, so there is never more than one
live link per seat.

Sessions are 30-day `HttpOnly` cookies. Signing out ends the session on the
server, so a copy of the cookie is worthless afterwards.

## Projects and ingestion tokens

A **project** is what owns the events reported into a Dolshoe instance. Each
project issues its own ingestion tokens, so a single application's credential can
be rotated or revoked without disturbing anything else, and every stored event
records which project it arrived under.

Project slugs are unique within their organization rather than across the
instance, so two tenants can both have a `checkout-api`.

The web app is organized the same way. `/orgs/<orgSlug>/projects` lists them;
opening one gives you its **Reports**, **Logs**, and **Tokens**, and the sidebar
switches between organizations and between projects without leaving the section
you are in.

Create a project and issue a token from the **Projects** screen in the web app.
The API underneath needs the same signed-in session as above:

```sh
curl -b "$cookies" -X POST http://localhost:<port>/api/v1/orgs/<orgSlug>/projects \
  -H 'content-type: application/json' -d '{"name":"Checkout API"}'

curl -b "$cookies" -X POST \
  http://localhost:<port>/api/v1/orgs/<orgSlug>/projects/<projectId>/tokens \
  -H 'content-type: application/json' -d '{"name":"production"}'
```

The issue response contains the token in plaintext. **It is shown once.** Only a
SHA-256 digest is stored, so a token that is not recorded at that moment has to
be replaced. Revoke one at any time; revocation is immediate and idempotent:

```sh
curl -b "$cookies" -X POST \
  http://localhost:<port>/api/v1/orgs/<orgSlug>/projects/<projectId>/tokens/<tokenId>/revoke
```

> [!IMPORTANT]
> Reading and managing projects now requires a signed-in viewer with a role in
> the owning organization. **Ingestion does not**, and its URLs have not moved:
> reporters still authenticate with a bearer ingestion token against
> `/api/v1/projects/<projectId>/error-reports` and `.../log-records`, exactly as
> their DSNs derive. A Dolshoe DSN is still a secret, and keeping the API off the
> public network is still good practice — it is simply no longer the only thing
> standing between a stranger and your tokens.

### DSN

A DSN packages the host, the token, and the project into one string to paste into
a reporter:

```text
https://dsh_a1b2c3d4e5f6_<secret>@dolshoe.example/<projectId>
        └─────── token ────────┘  └──── host ───┘ └ project ┘
```

The SDK derives both ingestion endpoints from it —
`/api/v1/projects/<projectId>/error-reports` and `.../log-records` — and sends
the token as a bearer credential. Path segments before the project id are kept as
a base path, so an instance served under a prefix needs no extra configuration.

Unlike a Sentry DSN, **a Dolshoe DSN is a secret**: Dolshoe's ingestion endpoints
are authenticated rather than open. Keep it out of client-side bundles and out of
version control, the same as any other credential.

Supplying `endpoint`, `logEndpoint`, or an `authorization` header explicitly
overrides whatever the DSN derives, which is the escape hatch for deployments
that route ingestion somewhere unusual.

## JavaScript reporters

Applications select their runtime package explicitly. Runtime packages own
exception normalization, runtime metadata, transport, global error hooks, and
flush behavior:

```ts
import * as Dolshoe from "@dolshoe/node";

Dolshoe.init({
  dsn: process.env.DOLSHOE_DSN,
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
redacts sensitive structured attributes, and sends records to the project's log
endpoint in batches of at most 100. Configure `beforeSendLogRecord` to transform or discard
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
  dsn: process.env.DOLSHOE_DSN,
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

A DSN enables structured logs along with error reports; set `logEndpoint`
explicitly only when routing them elsewhere. Log requests are limited to 1 MiB
and each batch is validated atomically.

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

| Variable                | Default in `.env.example` | Description                                                                               |
| ----------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`              | `development`             | `development`, `test`, or `production`                                                    |
| `PORT`                  | `3000`                    | HTTP listen port                                                                          |
| `LOG_LEVEL`             | `debug`                   | Minimum LogTape level                                                                     |
| `INGEST_TOKEN`          | empty                     | Legacy global bearer token, resolved to `default`                                         |
| `LOG_RETENTION_DAYS`    | `14`                      | Days to retain logs, based on server receipt time                                         |
| `DATABASE_URL`          | local PostgreSQL          | Prisma and application connection URL                                                     |
| `SESSION_COOKIE_SECURE` | follows `NODE_ENV`        | `Secure` on the session cookie. Turn off for plain HTTP on a private network              |
| `GITHUB_CLIENT_ID`      | empty                     | OAuth app client id. Required to sign anybody in                                          |
| `GITHUB_CLIENT_SECRET`  | empty                     | OAuth app client secret                                                                   |
| `GITHUB_CALLBACK_URL`   | local web origin          | Where GitHub returns the browser. Must be browser-reachable and match GitHub's copy       |
| `GITHUB_ALLOWED_LOGINS` | empty                     | Comma-separated GitHub logins allowed to hold an account. Empty means no restriction      |
| `DOLSHOE_API_ORIGIN`    | `http://localhost:3000`   | Where the web app's server-side render reaches the API. Deliberately not `VITE_`-prefixed |

Development logs use a readable colored formatter. Production logs are emitted
as JSON Lines. Request bodies and tokens are never written to the API's
operational logs.

Ingestion accepts a per-project token, or — while it is set — the global
`INGEST_TOKEN`, which authenticates as the `default` project. Prefer per-project
tokens: `INGEST_TOKEN` exists so that instances predating projects keep working,
and it cannot be revoked for one application without breaking every other.

Outside production, **ingestion** with no credential at all is accepted and
recorded against the `default` project, so local development needs no setup. This
applies to ingestion only — viewer authentication never falls open, in any
environment, so the web app and the management API always require signing in.
Production never falls open either: without a valid credential every ingest is
rejected. An
instance running in production with neither `INGEST_TOKEN` nor a usable project
token still starts — otherwise revoking your last token would leave you unable to
boot the API you need in order to issue a new one — but logs an error saying
ingestion will reject everything until a token is issued.

## License

[MIT](LICENSE)
