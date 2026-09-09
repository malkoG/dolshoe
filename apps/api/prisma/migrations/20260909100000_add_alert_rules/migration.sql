-- AlterTable
ALTER TABLE "ErrorReport" ADD COLUMN "fingerprint" VARCHAR(64);

-- CreateIndex
CREATE INDEX "ErrorReport_projectId_fingerprint_idx" ON "ErrorReport"("projectId", "fingerprint");

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "conditionType" VARCHAR(50) NOT NULL,
    "environment" VARCHAR(100),
    "tagKey" VARCHAR(200),
    "tagValue" VARCHAR(200),
    "serviceName" VARCHAR(200),
    "thresholdCount" INTEGER,
    "thresholdWindowMinutes" INTEGER,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "lastFiredAt" TIMESTAMPTZ(3),
    "channels" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertRule_projectId_enabled_idx" ON "AlertRule"("projectId", "enabled");

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
