ALTER TABLE "QueueMessage"
    ALTER COLUMN "enqueuedAt"
        SET DEFAULT date_trunc('milliseconds', CURRENT_TIMESTAMP),
    ALTER COLUMN "availableAt"
        SET DEFAULT date_trunc('milliseconds', CURRENT_TIMESTAMP);
