import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { appConfig } from "../config/app-config";
import { PrismaService } from "../database/prisma.service";

const logger = getLogger(["dolshoe", "auth", "readiness"]);

/**
 * Warns about the two states in which signing in does not work as intended.
 *
 * @remarks
 * Logs rather than throws, for the same reason `IngestReadinessService` does:
 * refusing to boot would strand the operator, because both problems are fixed
 * from outside an API that would not be running.
 *
 * The claim window this warns about is real. An instance with no accounts is
 * claimed by whichever GitHub account reaches it first, which matters most right
 * after an upgrade, when a previously open instance is suddenly claimable. An
 * allowlist closes that window without anyone having to be at the keyboard,
 * which is why the warning names it.
 */
@Injectable()
export class InstanceClaimReadinessService implements OnApplicationBootstrap {
  constructor(private readonly database: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (appConfig.github == null) {
      logger.warn(
        "GitHub sign-in is not configured, so nobody can sign in to this instance. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL.",
      );
    }

    const existing = await this.database.user.findFirst({ select: { id: true } });
    if (existing != null) return;

    if (appConfig.githubAllowedLogins.length > 0) {
      logger.info(
        "This instance has no accounts yet. The first allowed GitHub account to sign in claims it.",
      );
      return;
    }

    logger.warn(
      "This instance has no accounts and no GITHUB_ALLOWED_LOGINS allowlist. Whichever GitHub account reaches it first claims it. Set the allowlist, or claim it now if it is reachable by anyone else.",
    );
  }
}
