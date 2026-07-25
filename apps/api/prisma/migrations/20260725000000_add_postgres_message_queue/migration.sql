CREATE TABLE "QueueMessage" (
    "id" UUID NOT NULL,
    "queue" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "deduplicationKey" VARCHAR(200),
    "enqueuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" VARCHAR(200),
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastError" TEXT,

    CONSTRAINT "QueueMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QueueMessage_attempt_check" CHECK ("attempt" >= 0),
    CONSTRAINT "QueueMessage_lease_check" CHECK (
        ("claimedBy" IS NULL AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
        OR
        ("claimedBy" IS NOT NULL AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "QueueMessage_queue_deduplicationKey_key"
    ON "QueueMessage"("queue", "deduplicationKey");
CREATE INDEX "QueueMessage_queue_availableAt_leaseExpiresAt_idx"
    ON "QueueMessage"("queue", "availableAt", "leaseExpiresAt");
CREATE INDEX "QueueMessage_leaseExpiresAt_idx"
    ON "QueueMessage"("leaseExpiresAt");
