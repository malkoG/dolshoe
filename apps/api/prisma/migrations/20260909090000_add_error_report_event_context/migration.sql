-- AlterTable
ALTER TABLE "ErrorReport"
  ADD COLUMN "userIdentifier" VARCHAR(200),
  ADD COLUMN "userEmail" VARCHAR(200),
  ADD COLUMN "userName" VARCHAR(200),
  ADD COLUMN "tags" JSONB,
  ADD COLUMN "breadcrumbs" JSONB;

-- CreateIndex
CREATE INDEX "ErrorReport_projectId_userIdentifier_idx" ON "ErrorReport"("projectId", "userIdentifier");
