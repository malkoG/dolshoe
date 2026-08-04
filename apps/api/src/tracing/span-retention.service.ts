import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { appConfig } from "../config/app-config";
import { SpanRepository } from "./span.repository";

const CLEANUP_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const logger = getLogger(["dolshoe", "tracing", "retention"]);

/**
 * Spans expire on their own schedule, and sooner than logs by default: a single
 * request produces one log record and a whole tree of spans.
 */
@Injectable()
export class SpanRetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(private readonly spans: SpanRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.deleteExpiredSpans();
    this.cleanupTimer = setInterval(() => {
      void this.deleteExpiredSpans();
    }, CLEANUP_INTERVAL_MILLISECONDS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer != null) clearInterval(this.cleanupTimer);
  }

  private async deleteExpiredSpans(): Promise<void> {
    const cutoff = new Date(Date.now() - appConfig.spanRetentionDays * 24 * 60 * 60 * 1_000);

    try {
      const deletedCount = await this.spans.deleteReceivedBefore(cutoff);
      if (deletedCount > 0) {
        logger.info("Deleted {deletedCount} expired spans.", {
          deletedCount,
          cutoff: cutoff.toISOString(),
        });
      }
    } catch (error) {
      logger.error("Failed to delete expired spans.", {
        error,
        cutoff: cutoff.toISOString(),
      });
    }
  }
}
