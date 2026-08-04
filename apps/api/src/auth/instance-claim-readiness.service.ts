import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { PrismaService } from "../database/prisma.service";

const logger = getLogger(["dolshoe", "auth", "readiness"]);

/**
 * Warns while an instance still has no accounts.
 *
 * @remarks
 * Logs rather than throws, for the same reason `IngestReadinessService` does:
 * refusing to boot would strand the operator, because registering the first
 * account is only possible through the API that would not be running.
 *
 * The window this warns about is real. An instance with no accounts can be
 * claimed by whoever reaches it first, which matters most right after an
 * upgrade, when a previously open instance is suddenly claimable. It is still
 * strictly narrower than the state it replaces — an API anyone could mint
 * ingestion tokens against, indefinitely — but it closes only once somebody
 * claims it.
 */
@Injectable()
export class InstanceClaimReadinessService implements OnApplicationBootstrap {
  constructor(private readonly database: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.database.user.findFirst({ select: { id: true } });
    if (existing != null) return;

    logger.warn(
      "This instance has no accounts. Whoever reaches it first can register and claim it. Claim it now if it is reachable by anyone else.",
    );
  }
}
