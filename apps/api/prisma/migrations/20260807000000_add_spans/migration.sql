-- Spans, the third signal Dolshoe stores. ErrorReport and LogRecord have carried
-- "traceId" and "spanId" since they were created, but nothing ever wrote the span
-- those ids point at; this is that table.
--
-- "parentSpanId" is a plain column rather than a self-referencing foreign key.
-- Children routinely arrive before their parent — a server span is only exported
-- once it ends, which is after every child it created — and a parent may belong
-- to a service that never reports to this instance at all. A referential
-- constraint would reject that entirely ordinary data.
--
-- Time is stored twice on purpose. "startedAt" is what listing, ordering, and
-- retention query, and is all a JavaScript Date can carry; "startTimeUnixNano"
-- keeps the exact nanoseconds OTLP reported, because a waterfall places sibling
-- spans microseconds apart and TIMESTAMPTZ(3) cannot tell them apart. There is
-- no "endedAt": it is the start plus the duration, and no query asks for it.
--
-- "id" defaults to gen_random_uuid() in the database, not only in Prisma, because
-- spans are inserted through a raw multi-row INSERT that does not supply one.
CREATE TABLE "Span" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "traceId" CHAR(32) NOT NULL,
    "spanId" CHAR(16) NOT NULL,
    "parentSpanId" CHAR(16),
    "name" VARCHAR(500) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "statusCode" VARCHAR(5) NOT NULL,
    "statusMessage" VARCHAR(1024),
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "startTimeUnixNano" BIGINT NOT NULL,
    "durationNanoseconds" BIGINT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceName" VARCHAR(200) NOT NULL,
    "environment" VARCHAR(100),
    "release" VARCHAR(200),
    "scopeName" VARCHAR(200),
    "scopeVersion" VARCHAR(100),
    "attributes" JSONB,
    "resourceAttributes" JSONB,

    CONSTRAINT "Span_pkey" PRIMARY KEY ("id")
);

-- Idempotency and the trace view's read, served by one index. OTLP carries no
-- client-generated eventId the way the other two signals do, but it does not need
-- one: a span is already identified by its trace and span ids, and an exporter
-- retrying a batch re-sends identical spans. Ingestion relies on this constraint
-- for ON CONFLICT DO NOTHING, and the leading ("projectId", "traceId") is exactly
-- how the waterfall fetches a trace.
CREATE UNIQUE INDEX "Span_projectId_traceId_spanId_key"
    ON "Span"("projectId", "traceId", "spanId");

-- Listing recent traces reads only root spans, which are the rows where
-- "parentSpanId" IS NULL. A btree serves that as readily as an equality, so this
-- does not need to be a partial index.
CREATE INDEX "Span_projectId_parentSpanId_startedAt_idx"
    ON "Span"("projectId", "parentSpanId", "startedAt" DESC);

-- The retention sweep deletes by receipt time.
CREATE INDEX "Span_receivedAt_idx" ON "Span"("receivedAt" DESC);

ALTER TABLE "Span" ADD CONSTRAINT "Span_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
