import { Injectable, UnauthorizedException } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { PrismaService } from "../database/prisma.service";
import { IngestedProject } from "../ingestion/ingested-project";
import { ABSENT_TOKEN_HASH, hashProjectToken, hashesMatch } from "./project-token";

/**
 * How stale a token's `lastUsedAt` may be before the next successful
 * verification refreshes it. Steady-state ingestion would otherwise add one
 * write per request for a value nothing depends on.
 */
const LAST_USED_REFRESH_INTERVAL_MILLISECONDS = 60 * 1_000;

const logger = getLogger(["dolshoe", "projects", "token"]);

/**
 * Resolves a presented ingestion token to the project that owns it.
 *
 * @remarks
 * Verification costs one unique-index probe, on the same connection as the
 * insert the request is about to perform. If that ever shows up in a profile,
 * the escape hatch is a short-TTL `Map` from prefix to the selected row inside
 * this class; the price is that revocation takes up to that TTL to take effect.
 */
@Injectable()
export class ProjectTokenVerifier {
  constructor(private readonly database: PrismaService) {}

  async verify(rawToken: string, prefix: string): Promise<IngestedProject> {
    const stored = await this.database.projectToken.findUnique({
      where: { prefix },
      select: {
        id: true,
        tokenHash: true,
        lastUsedAt: true,
        revokedAt: true,
        project: { select: { id: true, slug: true } },
      },
    });

    // Hashing and comparing even when nothing was found keeps a prefix that
    // exists indistinguishable from one that does not.
    const presented = hashProjectToken(rawToken);
    const matches = hashesMatch(presented, stored?.tokenHash ?? ABSENT_TOKEN_HASH);

    if (stored == null || !matches || stored.revokedAt != null) {
      throw new UnauthorizedException("A valid ingestion bearer token is required.");
    }

    this.refreshLastUsedAt(stored.id, stored.lastUsedAt);

    return { id: stored.project.id, slug: stored.project.slug };
  }

  /**
   * Records the token's use without blocking the request. Last-used is
   * observability, not authorization, so it must never add latency to an ingest
   * or turn a successful one into a failure.
   */
  private refreshLastUsedAt(tokenId: string, lastUsedAt: Date | null): void {
    const now = Date.now();
    if (
      lastUsedAt != null &&
      now - lastUsedAt.getTime() < LAST_USED_REFRESH_INTERVAL_MILLISECONDS
    ) {
      return;
    }

    void this.database.projectToken
      .update({ where: { id: tokenId }, data: { lastUsedAt: new Date(now) } })
      .catch((error: unknown) => {
        logger.warn("Could not record last use of ingestion token {tokenId}.", {
          tokenId,
          error,
        });
      });
  }
}
