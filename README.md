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
with LogTape, OTLP trace ingestion, and a database-aware health endpoint.

## Requirements

- [mise](https://mise.jdx.dev/)
- Docker with Docker Compose

Node.js, pnpm, Deno, Bun, Python, and uv are pinned in `mise.toml`; no global
NestJS, Prisma, or Python CLI is required.

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
    │   ├── organizations/
    │   ├── projects/
    │   └── tracing/
    └── test/
packages/
├── core/             Runtime-neutral JavaScript report DTO and client
├── node/             Node.js reporter
├── deno/             Deno reporter
├── bun/              Bun reporter
├── logtape/          LogTape-to-Dolshoe bridge
└── python/           Python reporter, with a stdlib logging bridge
examples/
├── logtape-runtimes/   Equivalent Node, Deno, and Bun reporting scenarios
└── python-frameworks/  Dolshoe wired into Django and FastAPI
docs/
└── github-sign-in.md  Registering an OAuth app and pointing an instance at it
```

Prisma remains inside the API because it has only one consumer. The reporter
packages share the versioned ingestion contract because Node, Deno, and Bun are
concrete consumers of the same payload.

JavaScript is five packages and Python is one for a reason that is worth
knowing before adding to either. `core` exists because it cannot import
`node:async_hooks` and still has to run on four runtimes, so tracking the active
span is a seam each runtime package fills. Python has one runtime and one
answer — a `ContextVar` is per-thread and per-task at once — so the same split
would create a seam with nothing on the other side of it. The logging bridge is
inside the Python package for the matching reason: LogTape is a third-party peer
dependency to isolate, and `logging` is standard library.

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

An instance needs an OAuth app of its own before anyone can sign in:

```sh
GITHUB_CLIENT_ID=Iv1.0123456789abcdef
GITHUB_CLIENT_SECRET=…
GITHUB_CALLBACK_URL=https://dolshoe.example.com/api/v1/auth/github/callback
```

All three go together: set all of them or none. Without them the API still
starts, warns, and the sign-in page explains that nobody can sign in yet.

**[Setting up GitHub sign-in](docs/github-sign-in.md)** walks through registering
the app, choosing the callback URL, and what to check when a sign-in comes back
refused.

Dolshoe asks GitHub for `read:user` and `user:email`, both read-only. It never
asks for repository access.

### Signing in while developing

Registering an OAuth app before you can see a single screen is a lot to ask of a
fresh clone. `MOCK_LOGIN` skips it:

```sh
MOCK_LOGIN=true
```

The sign-in page then offers a field instead of only a button. Type a login and
you are that account — GitHub is never asked, and nothing is verified.

Only the identity is invented. Everything after it is the code a real sign-in
runs, so a development instance turns down exactly what a deployed one would:
`GITHUB_ALLOWED_LOGINS` still applies, the first login to arrive still claims the
instance, and every login after it still needs an invitation. Signing in as the
same login twice reaches the same account, across restarts, so `dev` and
`reviewer` stay two distinct people with distinct memberships.

> [!WARNING]
> **This is an open door.** Anyone who can reach the instance can sign in as any
> account by typing its login. An instance with `NODE_ENV=production` and
> `MOCK_LOGIN` set refuses to start rather than serve traffic that way, and one
> running with it says so in a warning at startup. Without it the route does not
> answer at all.

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

On a development instance running with `MOCK_LOGIN`, `curl` can start a session
itself, because that sign-in never leaves the origin — no browser and no copying
required:

```sh
curl -c jar.txt -X POST http://localhost:<port>/api/v1/auth/mock/session \
  -H 'content-type: application/json' -d '{"login":"dev"}'

curl -b jar.txt http://localhost:<port>/api/v1/orgs
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
> `/api/v1/projects/<projectId>/error-reports`, `.../log-records`, and
> `.../traces`, exactly as their DSNs derive. A Dolshoe DSN is still a secret, and keeping the API off the
> public network is still good practice — it is simply no longer the only thing
> standing between a stranger and your tokens.

### DSN

A DSN packages the host, the token, and the project into one string to paste into
a reporter:

```text
https://dsh_a1b2c3d4e5f6_<secret>@dolshoe.example/<projectId>
        └─────── token ────────┘  └──── host ───┘ └ project ┘
```

The SDK derives all three ingestion endpoints from it —
`/api/v1/projects/<projectId>/error-reports`, `.../log-records`, and
`.../traces` — and sends the token as a bearer credential. Path segments before
the project id are kept as a base path, so an instance served under a prefix
needs no extra configuration. An existing DSN gains tracing without being
changed.

Unlike a Sentry DSN, **a Dolshoe DSN is a secret**: Dolshoe's ingestion endpoints
are authenticated rather than open. Keep it out of client-side bundles and out of
version control, the same as any other credential.

Supplying `endpoint`, `logEndpoint`, `spanEndpoint`, or an `authorization`
header explicitly overrides whatever the DSN derives, which is the escape hatch
for deployments that route ingestion somewhere unusual.

## Traces and spans

A **span** is one operation inside a request: the incoming HTTP call, the
outbound service call it made, the query underneath that. Every span names the
span that enclosed it, so the spans sharing a trace id form a tree rather than a
list, and a request can be read end to end.

Spans arrive as **OTLP/HTTP JSON**, the OpenTelemetry wire format. There is no
Dolshoe-specific exporter to install: point an OpenTelemetry SDK or collector at
the instance and it works.

```sh
# The exporter appends /v1/traces to a generic endpoint, which is what the
# /otlp path segment is there to absorb.
export OTEL_EXPORTER_OTLP_ENDPOINT="https://dolshoe.example/api/v1/projects/<projectId>/otlp"
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer%20dsh_a1b2c3d4e5f6_<secret>"
```

`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is used verbatim instead of having a path
appended, so it can name any of the three routes directly:

| Route                                              | Credential                         |
| -------------------------------------------------- | ---------------------------------- |
| `POST /api/v1/projects/<projectId>/traces`         | project ingestion token            |
| `POST /api/v1/projects/<projectId>/otlp/v1/traces` | project ingestion token            |
| `POST /api/v1/traces`                              | `INGEST_TOKEN`, or a project token |

> [!IMPORTANT]
> Set the protocol to `http/json`. Most exporters default to `http/protobuf`,
> which Dolshoe does not read; such a request is answered with `415` and a
> message naming this setting rather than failing as a malformed body.

A request carries up to 1000 spans within the usual 1 MiB body limit, and is
answered with `200` and OTLP's `{"partialSuccess":{}}`. Re-exporting a span
changes nothing: a span is identified by its trace and span ids, so a retried
batch is stored once. A span that cannot be read — a malformed id, a span that
never ended — is dropped and counted, and the rest of the batch is kept:

```json
{ "partialSuccess": { "rejectedSpans": "1", "errorMessage": "A span had not ended…" } }
```

That is deliberate. Failing the whole request would have the exporter retry a
batch the server has already judged unreadable, indefinitely.

Spans are retained for `SPAN_RETENTION_DAYS` (7 by default) from receipt —
shorter than logs, because one request produces a single log record and an
entire tree of spans.

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

### Measuring spans

`withSpan()` runs your work inside a span and reports it when the work finishes:

```ts
await Dolshoe.withSpan(
  "POST /orders",
  async (span) => {
    span.setAttributes({ "http.request.method": "POST", "http.route": "/orders" });

    // Nested without being passed anything: the enclosing span is the parent.
    const total = await Dolshoe.withSpan("price basket", () => priceBasket(basket));

    // And errors and logs written in here carry that span, unasked.
    Dolshoe.captureLog("info", "Basket priced", { attributes: { total } });
  },
  { kind: "server" },
);
```

That last part is the point of it. `captureException()` and `captureLog()`
default their trace context to whichever span is active, so the `traceId` and
`spanId` on a stored error or log record point at a span you can actually open —
without threading ids through every function that might want to log. Passing
`trace` explicitly still overrides it.

`startSpan()` is the manual form for work that does not fit a callback; call
`end()` yourself, and know that an unended span is never reported. `activeSpan()`
returns the current one, if any. Spans are batched and sent as OTLP, to the same
endpoint an OpenTelemetry exporter would use, so nothing about a Dolshoe-reported
span is special once stored.

The active span is tracked with `AsyncLocalStorage` in the Node, Deno, and Bun
packages, so two requests in flight at once do not become each other's parent.
A `Client` constructed by hand gets a synchronous fallback instead, which is
correct for straight-line code; supply `spanScope` to change that.

> [!NOTE]
> Dolshoe's own SDK is not required for tracing. Any OpenTelemetry SDK exports
> to the same endpoints — see [Traces and spans](#traces-and-spans). Use this API
> when you want spans, errors, and logs to correlate without wiring up two SDKs.

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

LogTape records correlate to traces two ways. Inside `withSpan()` they pick up
the active span like any other capture. And a service that already propagates
W3C trace context through LogTape's own implicit contexts gets correlation
without adopting Dolshoe's span API at all — the bridge lifts `traceId` and
`spanId` out of a record's properties and stores them as trace context rather
than as attributes:

```ts
import { withContext } from "@logtape/logtape";

withContext({ traceId, spanId }, () => handleRequest(request));
```

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

## Python reporter

The same three endpoints, the same DSN, from Python:

```python
import dolshoe

dolshoe.init(
    dsn=os.environ["DOLSHOE_DSN"],
    service={"name": "checkout-api", "environment": "production"},
)

with dolshoe.with_span("POST /orders", kind="server") as span:
    span.set_attributes({"http.route": "/orders"})
    dolshoe.capture_log("info", "Order submitted", category=["checkout", "orders"])
```

A span is a context manager rather than the callback JavaScript uses, because
JavaScript has no `with` and Python does. The active span lives in a
`ContextVar`, which is per-thread _and_ per-task, so threads and asyncio tasks
are both handled without an application choosing between them — and two
requests in flight never become each other's parent.

The package has **no dependencies**, and should keep having none. A reporter
that drags an HTTP stack into an application can create a version conflict in
exactly the application that is already failing, which is the worst moment to
find one. The cost is that `urllib` does not reuse connections, so each batch
pays a handshake; batches of up to 100 make that cheap, and `transport=` is
there for an application that would rather use its own client.

`init()` installs `sys.excepthook`, `threading.excepthook`, and
`sys.unraisablehook`, each **chaining to whatever was there before** rather than
replacing it — the reporter observes a crashing process without changing how it
crashes. Pass `capture_unhandled_errors=False` to install none of them. Delivery
happens on one background thread, so a capture call returns an event id without
waiting on a request; `flush()` waits for the queue and reports whether
everything landed, and `close()` drains it during shutdown.

> [!IMPORTANT]
> gunicorn and uWSGI fork worker processes, and a thread does not survive
> `fork()`. The reporter rebuilds its delivery thread in the child through
> `os.register_at_fork`. Without that a forked worker would queue events nothing
> was draining — silently dead in production while working in development.

### Bridging the logging module

`logging` is what a Python application already uses, so existing calls should
not have to change:

```python
dolshoe.install_logging_handler(level=logging.INFO)

logging.getLogger("checkout.orders").info("Basket priced", extra={"total": 45_000})
```

The logger's dotted name becomes the record's category, `extra=` becomes its
attributes, and an `exc_info` at error level or above becomes an error report
rather than a log record, so tracebacks stay first-class — the same split the
LogTape bridge makes. Records from the `dolshoe` logger are never forwarded,
which is also where a failed send is reported, so a delivery failure cannot
become an event that fails to deliver. A service already propagating W3C trace
context can put `trace_id` and `span_id` in `extra=` and have its logs
correlated without adopting the span API at all.

Python fills in fields the JavaScript reporters cannot: `moduleName` and
`sourceLine` on every frame, `context` from an exception's `__context__`, and
`children` from an `ExceptionGroup`. Frames are ordered innermost first, so a
stored report's location is the line that failed rather than the process entry
point.

### Testing your instrumentation

Whether an application reports what it should is the application's question,
and answering it should not mean writing a fake transport in every project.
`dolshoe.testing` records instead of sending:

```python
from dolshoe.testing import capture_telemetry

def test_orders_are_measured():
    with capture_telemetry() as captured:
        handle_request()

    assert captured.span_tree() == [("POST /orders", [("price basket", [])])]
```

Under pytest the same thing arrives as a `captured_telemetry` fixture, which
needs no configuration — the package registers itself as a plugin, so
installing it is enough.

Ids and timestamps are sequential by default, which is what makes it worth
comparing a whole payload rather than a hand-picked field: an assertion against
a value you can read also catches the fields nobody thought to name, and the
ingestion contract is `.strict()` about exactly those. Pass
`deterministic=False` when the test is specifically about ids being unique.
Reading `captured.spans`, `.records`, or `.reports` waits for the delivery
thread first, so a test cannot pass or fail on timing.

`examples/python-frameworks/` has the whole thing wired into Django and
FastAPI, including where each framework needs a hand. Its own tests use
`dolshoe.testing` and nothing private — if the examples needed inside help to
be testable, so would everybody else.

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
pnpm sdk:python:test   # The Python reporter
pnpm sdk:python:test:frameworks # The Django and FastAPI examples
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

| Variable                | Default in `.env.example` | Description                                                                                  |
| ----------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`              | `development`             | `development`, `test`, or `production`                                                       |
| `PORT`                  | `3000`                    | HTTP listen port                                                                             |
| `LOG_LEVEL`             | `debug`                   | Minimum LogTape level                                                                        |
| `INGEST_TOKEN`          | empty                     | Legacy global bearer token, resolved to `default`                                            |
| `LOG_RETENTION_DAYS`    | `14`                      | Days to retain logs, based on server receipt time                                            |
| `SPAN_RETENTION_DAYS`   | `7`                       | Days to retain spans, based on server receipt time                                           |
| `DATABASE_URL`          | local PostgreSQL          | Prisma and application connection URL                                                        |
| `SESSION_COOKIE_SECURE` | follows `NODE_ENV`        | `Secure` on the session cookie. Turn off for plain HTTP on a private network                 |
| `GITHUB_CLIENT_ID`      | empty                     | OAuth app client id. Required to sign anybody in                                             |
| `GITHUB_CLIENT_SECRET`  | empty                     | OAuth app client secret                                                                      |
| `GITHUB_CALLBACK_URL`   | local web origin          | Where GitHub returns the browser. Must be browser-reachable and match GitHub's copy          |
| `GITHUB_ALLOWED_LOGINS` | empty                     | Comma-separated GitHub logins allowed to hold an account. Empty means no restriction         |
| `MOCK_LOGIN`            | empty                     | Development only. Signs anybody in as a login they type. Production refuses to start with it |
| `DOLSHOE_API_ORIGIN`    | `http://localhost:3000`   | Where the web app's server-side render reaches the API. Deliberately not `VITE_`-prefixed    |

Development logs use a readable colored formatter. Production logs are emitted
as JSON Lines. Request bodies and tokens are never written to the API's
operational logs.

Ingestion accepts a per-project token, or — while it is set — the global
`INGEST_TOKEN`, which authenticates as the `default` project. Prefer per-project
tokens: `INGEST_TOKEN` exists so that instances predating projects keep working,
and it cannot be revoked for one application without breaking every other.

Outside production, **ingestion** with no credential at all is accepted and
recorded against the `default` project, so local development needs no setup. This
applies to ingestion only — viewer authentication never falls open on its own, in
any environment, so the web app and the management API always require signing in.
`MOCK_LOGIN` is the single exception, and it is one an operator has to ask for by
name: without it the route does not answer, and production will not start with
it.
Production never falls open either: without a valid credential every ingest is
rejected. An
instance running in production with neither `INGEST_TOKEN` nor a usable project
token still starts — otherwise revoking your last token would leave you unable to
boot the API you need in order to issue a new one — but logs an error saying
ingestion will reject everything until a token is issued.

## License

[MIT](LICENSE)
