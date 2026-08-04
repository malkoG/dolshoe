import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { appConfig } from "../config/app-config";
import { PrismaService } from "../database/prisma.service";

const logger = getLogger(["dolshoe", "ingestion", "readiness"]);

/**
 * Warns when a production instance has no way to authenticate an ingest.
 *
 * @remarks
 * Logs rather than throws. Startup validation used to enforce this by requiring
 * `INGEST_TOKEN`, but with per-project tokens the credentials live in the
 * database, and refusing to boot would strand an operator who had just revoked
 * their last token — leaving them unable to start the very API they need in
 * order to issue a new one. Ingestion is already closed in production without a
 * valid credential; this only makes the cause visible.
 */
@Injectable()
export class IngestReadinessService implements OnApplicationBootstrap {
  constructor(private readonly database: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (appConfig.nodeEnvironment !== "production" || appConfig.ingestToken != null) return;

    const usableToken = await this.database.projectToken.findFirst({
      where: { revokedAt: null },
      select: { id: true },
    });

    if (usableToken == null) {
      logger.error(
        "No ingestion credential exists: INGEST_TOKEN is unset and every project token is revoked. Ingestion will reject all requests until a token is issued.",
      );
    }
  }
}
