import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { appConfig } from "../config/app-config";
import { LogRecordRepository } from "./log-record.repository";

const CLEANUP_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const logger = getLogger(["dolshoe", "log-recording", "retention"]);

@Injectable()
export class LogRetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(private readonly logRecords: LogRecordRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.deleteExpiredRecords();
    this.cleanupTimer = setInterval(() => {
      void this.deleteExpiredRecords();
    }, CLEANUP_INTERVAL_MILLISECONDS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer != null) clearInterval(this.cleanupTimer);
  }

  private async deleteExpiredRecords(): Promise<void> {
    const cutoff = new Date(Date.now() - appConfig.logRetentionDays * 24 * 60 * 60 * 1_000);

    try {
      const deletedCount = await this.logRecords.deleteReceivedBefore(cutoff);
      if (deletedCount > 0) {
        logger.info("Deleted {deletedCount} expired log records.", {
          deletedCount,
          cutoff: cutoff.toISOString(),
        });
      }
    } catch (error) {
      logger.error("Failed to delete expired log records.", {
        error,
        cutoff: cutoff.toISOString(),
      });
    }
  }
}
