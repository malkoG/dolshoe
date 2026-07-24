CREATE TABLE "ErrorReport" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceName" VARCHAR(200) NOT NULL,
    "environment" VARCHAR(100),
    "release" VARCHAR(200),
    "runtimeName" VARCHAR(100) NOT NULL,
    "runtimeVersion" VARCHAR(100),
    "reporterName" VARCHAR(200) NOT NULL,
    "reporterVersion" VARCHAR(100),
    "mechanismType" VARCHAR(200),
    "handled" BOOLEAN,
    "traceId" CHAR(32),
    "spanId" CHAR(16),
    "exception" JSONB NOT NULL,
    "attributes" JSONB,

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErrorReport_eventId_key" ON "ErrorReport"("eventId");
CREATE INDEX "ErrorReport_serviceName_occurredAt_idx"
    ON "ErrorReport"("serviceName", "occurredAt" DESC);
CREATE INDEX "ErrorReport_traceId_idx" ON "ErrorReport"("traceId");
CREATE INDEX "ErrorReport_receivedAt_idx" ON "ErrorReport"("receivedAt" DESC);
