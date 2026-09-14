# Queue-first error-report ingestion

**Status:** Accepted target architecture. This document is the decision
only — no ingest port, provider, or endpoint change ships with it.
Implementation follows later, in order: [#5](https://github.com/malkoG/dolshoe/issues/5)
(provider contract) → [#6](https://github.com/malkoG/dolshoe/issues/6)
(PostgreSQL default provider) → [#9](https://github.com/malkoG/dolshoe/issues/9)
(moving ingress). Optional Redis Streams and RabbitMQ stay behind that
same contract; their plans are [#7](https://github.com/malkoG/dolshoe/issues/7)
and [#8](https://github.com/malkoG/dolshoe/issues/8).

On `main` today, `ErrorReportService.receive()` writes the canonical
`ErrorReport` row in the request path and then evaluates alert rules. A
successful response means the report is stored. A generic PostgreSQL
message queue exists in the API, but nothing in the error-report path
uses it. The first durable boundary is the reports table.

The target is the opposite: the selected queue provider is the first
durable boundary. Ingress authenticates, validates, enqueues, and answers
`202 Accepted`. A worker persists the canonical row afterward.

The reason is burst isolation. An error storm must not make ingest latency
wait on indexing, grouping, alert evaluation, or investigation work. Those
jobs belong after the event is safely held, not inside the reporter's HTTP
round trip.

This decision applies to **error-report** ingestion. Log records and OTLP
spans stay on today's synchronous path until they have their own reason to
move. Nested investigation identity (`traceId`, `spanId`, `parentSpanId`)
is owned by [#10](https://github.com/malkoG/dolshoe/issues/10) and is not
redesigned here; this ADR only records that investigations must not depend
on queue order.

## Decision

1. Treat the configured queue provider as the first durable write on the
   ingest path.
2. Return `202 Accepted` only after that provider has accepted the envelope
   under its own durability rules.
3. Deliver each envelope at least once. Canonical uniqueness is
   `(projectId, eventId)`, already on `ErrorReport`.
4. Acknowledge a queue message only after the worker's database commit
   succeeds.
5. PostgreSQL is the default queue provider — the zero-dependency
   boundary for a small self-hosted install. Redis Streams and RabbitMQ
   are optional provider boundaries, not extra faces of one pretend-durable
   queue.
6. Do not promise exactly-once delivery or global ordering.
7. Do not hide provider durability or acknowledgement differences. What
   `202` means, and what a worker ack does, is part of each boundary.

## What 202 Accepted means

`202` means Dolshoe has taken responsibility for the report under the
selected provider's acceptance rule, not that the canonical row exists.

The receipt is an **accepted** receipt. It preserves the client-generated
`eventId` and records `acceptedAt`. It does not include the server-assigned
`ErrorReport.id`, because that row is created later by the worker. Today's
`201 Created` body (`id`, `receivedAt`) is a persisted-resource receipt;
[#9](https://github.com/malkoG/dolshoe/issues/9) changes the wire contract
and OpenAPI to match acceptance.

A `202` is issued only after enqueue acceptance succeeds. A failed enqueue
is not a successful receipt. A client that retries because it never saw
the `202` may cause a second enqueue; that is expected, and `eventId`
makes the second canonical write a no-op.

Ingress work in the request path is only:

1. Authentication and admission control
2. Payload-size and contract validation
3. Ingestion-envelope construction (`eventId`, `projectId`, `occurredAt`,
   `acceptedAt`, immutable payload)
4. Enqueue
5. `202` after provider acceptance

## Provider boundaries

Three providers sit behind one ingest contract. The contract is the
shared operations and guarantees ([forward pointer to #5](#the-ingest-port-forward-pointer-to-5)).
The **boundary** is what "accepted" and "acknowledged" mean for that
provider. Those meanings stay visible. They are not flattened into a
generic "the queue accepted it."

PostgreSQL is the default boundary: the instance already has that
database, so the default deploy does not grow a second store. Redis
Streams and RabbitMQ are optional boundaries for installs that want
lower queue latency or isolation between ingest buffering and
PostgreSQL query load. Choosing one changes the durability of `202`
and the mechanics of worker ack. That is the point of offering them,
not a defect to hide.

|                                          | PostgreSQL (default)                                                                                                                                                     | Redis Streams (optional)                                                                                                                                                                  | RabbitMQ (optional)                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| When `202` is allowed                    | The queue/inbox row has committed. Same crash durability as the rest of the instance.                                                                                    | Redis has acknowledged `XADD`. Durability is the operator's AOF/RDB (and failover) configuration.                                                                                         | A publisher confirm has returned for a persistent publish onto a durable topology. Quorum Queues are the intended default; [#8](https://github.com/malkoG/dolshoe/issues/8) plans that topology. |
| What a crash can still lose after `202`  | Nothing the database itself would not lose.                                                                                                                              | Recent entries if persistence is off, asynchronous, or behind a failover that did not sync.                                                                                               | An unconfirmed publish never becomes `202`. A confirm the API process died before seeing is not acceptance; the client retries.                                                                  |
| Worker ack (only after canonical commit) | The delivery is released from the hot queue. A failed commit leaves it claimable again. How the hold is implemented is [#6](https://github.com/malkoG/dolshoe/issues/6). | The consumer-group entry is acknowledged (`XACK`). Unacked entries stay pending and can be claimed again. Abandoned-pending recovery is [#7](https://github.com/malkoG/dolshoe/issues/7). | The consumer issues a manual ack. Channel or consumer death redelivers unacked messages. Dead-letter topology is [#8](https://github.com/malkoG/dolshoe/issues/8).                               |
| Database down                            | Enqueue fails. `503`. Acceptance and storage share a fate.                                                                                                               | `202` can still succeed. The backlog grows until a worker can commit.                                                                                                                     | Same as Redis Streams: enqueue can succeed while PostgreSQL is down.                                                                                                                             |
| Required for default deploy              | Yes — already the instance database.                                                                                                                                     | No. Not loaded unless configured.                                                                                                                                                         | No. Not loaded unless configured.                                                                                                                                                                |

Health, docs, and configuration must say which boundary is running and
what its `202` actually guarantees. Optional isolation — accepting while
PostgreSQL is down — is a reason to choose Redis or RabbitMQ, not a
property the default must pretend to have.

## At-least-once delivery and duplicate handling

Delivery is at least once. Duplicates are the normal case: the client
retries after a lost `202`, a worker dies after commit but before ack, a
delivery is abandoned, or a provider redelivers.

The source of truth for "this event is already stored" is the existing
`@@unique([projectId, eventId])` constraint on `ErrorReport`. A worker
that hits that constraint treats the write as success and acknowledges.
It must not evaluate alert rules a second time — today's request-path
service already makes that distinction for the same reason.

Queue-level deduplication of a second enqueue of the same `eventId` may
exist on a provider to keep depth down. It is optional and best-effort,
and it is a visible provider difference — not a shared guarantee. A
provider that cannot dedupe still satisfies the contract, because the
database constraint does.

Exactly-once delivery is a non-goal. There is no two-phase commit between
the queue and PostgreSQL.

## Worker acknowledgement only after database commit

The worker consumes a delivery, persists the canonical event, and
acknowledges that delivery only after the transaction commits. A failed
transaction does not acknowledge. What "held" and "acknowledged" look
like on the wire is a [provider boundary](#provider-boundaries); the
shared rule is only the order: commit first, then ack.

Ack means "the canonical row exists." It does not mean alerts have fired,
fingerprints have been grouped, or an investigation has been assembled.

Those jobs cannot use ingest redelivery as their retry mechanism. A
redelivered envelope hits `(projectId, eventId)` and is skipped, so any
side effect that did not happen on the first attempt is not retried by
acking later. Alert evaluation, grouping, and investigation work therefore
need their own retry story once they move off the request path. This ADR
does not invent that story; it only forbids tying ingest ack to it.

The default deployment runs the consumer in-process with the API. A
second worker service is an operational choice, not a requirement for the
small self-hosted install.

## Retry, rejection, poison messages, and backpressure

**Ingress validation failures** never enqueue. Contract errors stay `400`;
bodies over the existing 1 MiB limit stay `413`; missing or invalid ingest
tokens stay `401`.

**Transient worker or database failures** return the delivery for retry
with optional delay. The envelope stays accepted. The client is not
involved. How that return is expressed is a
[provider boundary](#provider-boundaries).

**Poison messages** — envelopes that fail in a way retry will not fix
(unwritable payload after a schema change, repeated unexpected errors past
a configured attempt limit) — are rejected onto a dead-letter / poison
path and leave the hot queue. They are not stored as canonical events.
Operators must be able to see them. Forever-retry on the ingest queue is
not allowed: one bad payload must not stall the burst the queue exists to
absorb.

Ingress already validated the report, so poison should be rare. The path
exists for evolution and bugs, not as a second validation layer.

**Backpressure** is admission control at enqueue time. When the provider
refuses the write, or when configured depth / oldest-event-age limits are
exceeded, ingress does not accept the event. See [HTTP responses](#http-responses-when-the-queue-cannot-accept).

Worker consume batches are bounded. Exact limits belong in #5 / #6, not
here.

## Ordering guarantees and non-guarantees

There is no global ordering. There is no promised per-project or
per-trace FIFO across providers.

A PostgreSQL inbox will often look FIFO under light load. That is not a
contract. Redis consumer groups and RabbitMQ competing consumers will
interleave. Concurrent workers will interleave on every provider.

Investigations reconstruct from identifiers, not arrival order. Parents,
children, and events may be accepted in any order. Missing spans are
[#10](https://github.com/malkoG/dolshoe/issues/10)'s problem, not a queue
defect.

## `occurredAt`, `acceptedAt`, and `storedAt`

Three timestamps, three clocks, none rewritten to look like another.

| Timestamp    | Who sets it                     | Meaning                                                                                   |
| ------------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `occurredAt` | Reporter                        | When the failure happened. Ingress copies it. The worker stores it. Nobody "corrects" it. |
| `acceptedAt` | Ingress, at provider acceptance | When Dolshoe took responsibility. This is what `202` records.                             |
| `storedAt`   | Worker, at canonical commit     | When the `ErrorReport` row landed.                                                        |

Today's `receivedAt` is both acceptance and storage because they are the
same moment. After the cutover they are not. #9 decides how that split
appears on the wire and in the schema — whether `receivedAt` is renamed,
kept as a synonym, or joined by new columns. This ADR only freezes the
three meanings so later issues do not invent a fourth.

Provider-internal enqueue times are not substitutes for these three.

## HTTP responses when the queue cannot accept

| Situation                                                                                                                     | Status                   | Event accepted? |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------- |
| Auth failed                                                                                                                   | `401`                    | No              |
| Body fails the versioned report contract                                                                                      | `400`                    | No              |
| JSON body exceeds 1 MiB                                                                                                       | `413`                    | No              |
| Provider unreachable, write failed, or confirm/commit did not succeed                                                         | `503` with `Retry-After` | No              |
| Queue overload: depth or oldest-event age exceeds the configured admission limit, or the provider signals resource exhaustion | `503` with `Retry-After` | No              |

Overload is server capacity, so it is `503`, not `429`. `429` stays
available if a later change adds per-token rate limits; that is a
different signal.

A `202` that left the process is acceptance even if the client never
reads it. A timeout or connection reset after enqueue is the client's
reason to retry with the same `eventId`.

## Queue depth, oldest-event age, and processing lag

Every provider reports the same three measurements. How it reads them
may differ; what they mean does not.

- **Depth** — envelopes accepted and not yet acknowledged.
- **Oldest-event age** — `now - acceptedAt` of the oldest unacknowledged
  envelope. This is the operator's "how stale is the backlog?" number.
- **Processing lag** — delay from `acceptedAt` to `storedAt` for recently
  stored events. Age of an item still in queue is oldest-event age, not
  lag.

Retries, poison/dead-letter counts, and claim failures belong next to
these so a growing depth can be told apart from a stuck worker.

The existing `/api/v1/health` endpoint reports database ping only.
Provider health and lag are additive. With the default PostgreSQL
provider they collapse to the same dependency; with Redis or RabbitMQ
they must not. The exact payload is #5 / #9.

## Payload and batch size limits

The HTTP JSON body remains 1 MiB, matching the existing ingest paths.
The versioned error-report schema already bounds frames, children,
breadcrumbs, and attribute keys.

Error-report ingest is one report per request today. That stays one
envelope per enqueue. A later batch endpoint would still share the 1 MiB
body limit and add a numeric cap; it is not part of this decision.

The worker consumes a bounded batch. It does not load an unbounded
backlog into memory. Queue metadata stays narrow: identity, timestamps,
delivery token, attempt count. Payload contents are not indexed.

Nothing the HTTP layer rejected is written to the queue.

## Provider migration and configuration

The provider is chosen at process startup, from environment validated
there. An unknown provider, or Redis/RabbitMQ settings required by the
selected optional provider and missing, refuse to start. PostgreSQL is
selected when no external provider is configured. Optional provider
clients are not loaded on the default path.

Changing provider is an operational cutover, not a live dual-write.
In-flight envelopes on the old provider are not migrated automatically.
Drain them with a worker still configured for that provider, or accept
that unacknowledged envelopes there will not be stored. Ingress enqueues
to exactly one provider.

That also means a cutover from PostgreSQL to Redis changes what `202`
guarantees. The configuration change should be loud about that; the
contract must not paper over it.

Broker-specific routing — Redis stream key layout, RabbitMQ exchanges,
routing keys, headers — does not leak into application services. Those
are provider implementation details, planned in
[#7](https://github.com/malkoG/dolshoe/issues/7) and
[#8](https://github.com/malkoG/dolshoe/issues/8).

## Failure behavior

| Failure                                                              | What happens                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| API crashes after enqueue, before the `202` is written to the socket | The envelope may already be accepted. The client sees a reset or timeout and retries with the same `eventId`. The worker stores the report once.  |
| API crashes before enqueue                                           | Not accepted. The client retries.                                                                                                                 |
| Enqueue fails                                                        | `503`. Not accepted. No receipt.                                                                                                                  |
| Queue accepts, worker has not yet consumed                           | Envelope waits. Depth and oldest-event age grow. The client already has `202`.                                                                    |
| Worker crashes before the canonical commit                           | The delivery is not acknowledged. Another consume persists the row.                                                                               |
| Worker crashes after commit, before ack                              | Redelivery. Unique `(projectId, eventId)` is treated as success and acknowledged. Alerts are not re-fired.                                        |
| Database is down, provider is PostgreSQL                             | Enqueue fails. `503`. Acceptance and storage share a fate.                                                                                        |
| Database is down, provider is Redis or RabbitMQ                      | `202` can still succeed. The backlog grows until a worker can commit. Operators watch depth and lag; this is the durability trade-off they chose. |
| Database transaction fails in the worker                             | No ack. Retry.                                                                                                                                    |
| Provider is unreachable at ingest                                    | `503`. Not accepted.                                                                                                                              |
| Poison / max attempts exceeded                                       | Envelope leaves the hot queue onto the reject path. It is not a canonical event.                                                                  |

API, queue, worker, and database failures are different events. The table
is the spec for each.

## Shared guarantees versus visible differences

Every provider, including the default, must:

- Accept an immutable ingestion envelope or fail the enqueue.
- Deliver at least once; allow duplicates.
- Support consume, acknowledge, retry, reject, and graceful shutdown.
- Acknowledge only after the worker reports a successful canonical commit.
- Expose health, depth, oldest-event age, and processing lag.
- Honor payload bounds already enforced at the HTTP boundary.
- Avoid global ordering promises.

Providers may differ in — and must keep visible — the
[provider boundaries](#provider-boundaries):

- What "accepted" means for a crash in the next millisecond.
- What a worker ack, retry, or reject does on that provider.
- Whether enqueue can succeed while PostgreSQL is down.
- Deduplication of a second enqueue of the same `eventId`.
- How dead-lettering is stored.

## The ingest port (forward pointer to #5)

[#5](https://github.com/malkoG/dolshoe/issues/5) defines the TypeScript
port and its contract tests. This ADR only names the operations that port
must cover, so #5 does not invent the architecture while writing the
interface — and does not pretend the three providers share one
durability story:

- **Enqueue** an immutable envelope.
- **Consume** with an explicit delivery token.
- **Acknowledge** after canonical commit.
- **Retry** a failed attempt, with optional delay.
- **Reject** a poison message.
- **Shutdown** provider resources.
- **Health and lag** — readiness plus depth, oldest-event age, and
  processing lag.

The envelope needs stable identity and the three timestamps above
(`eventId`, `projectId`, `occurredAt`, `acceptedAt`, payload). Attempt
count and delivery-token expiry are provider metadata, not part of the
payload.

Today's generic message-queue type is not that port. How #5 is shaped,
and how #6 implements the PostgreSQL default behind it, is later work.
Application services depend on the ingest port, not on Redis or
RabbitMQ types.

## Nested investigations

[#10](https://github.com/malkoG/dolshoe/issues/10) owns the investigation
field contract and query model. Queue-first ingestion must not require
messages to arrive in parent-before-child order, and it must not invent
a second identifier for a span. Out-of-order acceptance is expected.

## Alternatives considered

**Keep synchronous canonical persistence (today).** The request waits for
`errorReport.create` and alert evaluation. An error burst couples ingest
latency to storage and downstream work. Rejected because that is the
problem the epic exists to remove.

**Persist the row in the request, then enqueue alerts or investigation
work.** The reporter still waits on the canonical write. The queue is not
the first durable boundary. Rejected as a half-move that leaves burst
isolation unsolved.

**Answer `202` from an in-memory buffer, without a provider accept.** A
process crash after the response loses events the client was told were
accepted. Rejected because `202` would lie.

**Transactional outbox in the request path.** The first write is still
PostgreSQL in the HTTP handler. That is persist-first, and it reintroduces
the latency the queue is meant to take off the reporter. Rejected for this
ingest path. An outbox remains a fine pattern for _other_ side effects
once the canonical row exists.

**Exactly-once delivery** (distributed transactions, or treating a
provider ack as a substitute for the unique constraint). Heavier than the
default deploy, and still fails in the crash windows every broker has.
Rejected. At-least-once plus `(projectId, eventId)` is the guarantee.

**Require Redis or RabbitMQ for every install.** Violates the small
self-hosted default. PostgreSQL is already required. The default queue
is that database.

**A generic broker facade that claims uniform durability.** Epic
non-goal. Operators choosing Redis without AOF would be told a `202` they
do not have.

**Global or per-project ordering.** Investigations do not need it, and
no optional provider can keep the promise under concurrent consumers.

**Acknowledge before the canonical commit.** The crash window between ack
and persist drops an event that was already `202 Accepted`. Rejected.

**Expose Redis or RabbitMQ routing through the common contract.** Couples
ingestion and worker code to vendor APIs. Rejected; keep the port narrow.

## Follow-on work

| Issue                                              | Owns                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [#5](https://github.com/malkoG/dolshoe/issues/5)   | Ingest provider port, envelope, shared contract tests — first                                       |
| [#6](https://github.com/malkoG/dolshoe/issues/6)   | PostgreSQL default provider, behind that port                                                       |
| [#7](https://github.com/malkoG/dolshoe/issues/7)   | Redis Streams optional-provider plan                                                                |
| [#8](https://github.com/malkoG/dolshoe/issues/8)   | RabbitMQ optional-provider plan                                                                     |
| [#9](https://github.com/malkoG/dolshoe/issues/9)   | Move the error-report endpoint and worker onto this workflow; receipt and OpenAPI — after #5 and #6 |
| [#10](https://github.com/malkoG/dolshoe/issues/10) | Nested investigation field contract — already a separate freeze; not this document                  |

## Non-goals

- Exactly-once delivery
- Global or per-project message ordering
- Hiding provider-specific durability differences
- Requiring an external queue for the default deployment
- Exposing RabbitMQ- or Redis-specific routing through the common contract
- Any implementation in this change — port, provider, or endpoint
- The TypeScript ingest port (that is #5)
- Redesigning investigation identity or queries (that is #10)
- Moving log or trace ingest onto the queue
- The retry mechanism for alerts, grouping, or investigation after the
  canonical row exists
