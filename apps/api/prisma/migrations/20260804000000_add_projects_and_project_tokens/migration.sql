CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt" DESC);

CREATE TABLE "ProjectToken" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ProjectToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectToken_prefix_key" ON "ProjectToken"("prefix");
CREATE INDEX "ProjectToken_projectId_createdAt_idx"
    ON "ProjectToken"("projectId", "createdAt" DESC);

ALTER TABLE "ProjectToken"
    ADD CONSTRAINT "ProjectToken_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The default project owns every event recorded before projects existed, and is
-- what the legacy INGEST_TOKEN resolves to. Its id is fixed rather than generated
-- because that token lives in the environment, not the database: the ingestion
-- guard needs a constant to resolve to without a lookup. Mirrored in TypeScript as
-- DEFAULT_PROJECT_ID in apps/api/src/projects/default-project.ts.
INSERT INTO "Project" ("id", "slug", "name")
VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'Default')
ON CONFLICT ("id") DO NOTHING;

-- Add, backfill, then constrain. The column intentionally has no default: a
-- default would silently absorb a future bug where an ingestion path forgets to
-- pass the project.
ALTER TABLE "ErrorReport" ADD COLUMN "projectId" UUID;
UPDATE "ErrorReport" SET "projectId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "ErrorReport" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "ErrorReport"
    ADD CONSTRAINT "ErrorReport_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ErrorReport_projectId_receivedAt_idx"
    ON "ErrorReport"("projectId", "receivedAt" DESC);

ALTER TABLE "LogRecord" ADD COLUMN "projectId" UUID;
UPDATE "LogRecord" SET "projectId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "LogRecord" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "LogRecord"
    ADD CONSTRAINT "LogRecord_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "LogRecord_projectId_idx" ON "LogRecord"("projectId");
