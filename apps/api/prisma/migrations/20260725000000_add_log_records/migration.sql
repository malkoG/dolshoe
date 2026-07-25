CREATE TABLE "LogRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" VARCHAR(10) NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT[] NOT NULL,
    "serviceName" VARCHAR(200) NOT NULL,
    "environment" VARCHAR(100),
    "release" VARCHAR(200),
    "runtimeName" VARCHAR(100) NOT NULL,
    "runtimeVersion" VARCHAR(100),
    "reporterName" VARCHAR(200) NOT NULL,
    "reporterVersion" VARCHAR(100),
    "traceId" CHAR(32),
    "spanId" CHAR(16),
    "errorReportEventId" UUID,
    "attributes" JSONB,

    CONSTRAINT "LogRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogRecord_eventId_key" ON "LogRecord"("eventId");
CREATE INDEX "LogRecord_serviceName_occurredAt_idx"
    ON "LogRecord"("serviceName", "occurredAt" DESC);
CREATE INDEX "LogRecord_level_occurredAt_idx"
    ON "LogRecord"("level", "occurredAt" DESC);
CREATE INDEX "LogRecord_traceId_idx" ON "LogRecord"("traceId");
CREATE INDEX "LogRecord_receivedAt_idx" ON "LogRecord"("receivedAt" DESC);
