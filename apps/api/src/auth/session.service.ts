import { Injectable, UnauthorizedException } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { PrismaService } from "../database/prisma.service";
import { ABSENT_SESSION_HASH, generateSessionToken, hashSessionToken } from "./session-token";
import { hashesMatch } from "../credentials/opaque-token";
import { Viewer } from "./viewer";

/**
 * How long a session stays valid, counted from when it was created rather than
 * from its last use. A sliding window would keep an unattended browser signed in
 * forever; a fixed one costs an operator a sign-in a month, which is the right
 * trade for a tool that guards production error data.
 */
const SESSION_LIFETIME_DAYS = 30;

/**
 * How stale a session's `lastUsedAt` may be before the next request refreshes
 * it. Without this every page load would add a write for a value nothing
 * depends on.
 */
const LAST_USED_REFRESH_INTERVAL_MILLISECONDS = 60 * 1_000;

const logger = getLogger(["dolshoe", "auth", "session"]);

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Issues and resolves the sessions that authenticate a browser.
 *
 * @remarks
 * Sessions are rows rather than signed tokens because they have to be
 * revocable. Signing out has to end the session now, and losing access to an
 * organization has to take effect now — neither is possible if the credential
 * is self-describing and only expires. A revocation list bolted onto a signed
 * token is this table with extra steps.
 */
@Injectable()
export class SessionService {
  constructor(private readonly database: PrismaService) {}

  async create(userId: string): Promise<IssuedSession> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1_000);

    await this.database.session.create({
      data: { userId, prefix: token.prefix, tokenHash: token.hash, expiresAt },
      select: { id: true },
    });

    return { token: token.raw, expiresAt };
  }

  async verify(rawToken: string, prefix: string): Promise<Viewer> {
    const stored = await this.database.session.findUnique({
      where: { prefix },
      select: {
        id: true,
        tokenHash: true,
        lastUsedAt: true,
        expiresAt: true,
        user: {
          select: { id: true, email: true, name: true, githubLogin: true, avatarUrl: true },
        },
      },
    });

    // Hashing and comparing even when nothing was found keeps a prefix that
    // exists indistinguishable from one that does not.
    const presented = hashSessionToken(rawToken);
    const matches = hashesMatch(presented, stored?.tokenHash ?? ABSENT_SESSION_HASH);

    if (stored == null || !matches) {
      throw new UnauthorizedException("A signed-in session is required.");
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      this.discardExpired(stored.id);
      throw new UnauthorizedException("This session has expired. Sign in again.");
    }

    this.refreshLastUsedAt(stored.id, stored.lastUsedAt);

    return {
      id: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      githubLogin: stored.user.githubLogin,
      avatarUrl: stored.user.avatarUrl,
      sessionId: stored.id,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    // Idempotent by construction: signing out twice, or with a session another
    // tab already ended, is a no-op rather than an error the caller has to
    // distinguish from a real failure.
    await this.database.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.database.session.deleteMany({ where: { userId } });
  }

  /**
   * Records the session's use without blocking the request, the same way an
   * ingestion token records its last use: this is observability, not
   * authorization, and must never turn a good request into a failed one.
   */
  private refreshLastUsedAt(sessionId: string, lastUsedAt: Date): void {
    const now = Date.now();
    if (now - lastUsedAt.getTime() < LAST_USED_REFRESH_INTERVAL_MILLISECONDS) return;

    void this.database.session
      .update({ where: { id: sessionId }, data: { lastUsedAt: new Date(now) } })
      .catch((error: unknown) => {
        logger.warn("Could not record last use of session {sessionId}.", { sessionId, error });
      });
  }

  private discardExpired(sessionId: string): void {
    void this.database.session.deleteMany({ where: { id: sessionId } }).catch((error: unknown) => {
      logger.warn("Could not delete expired session {sessionId}.", { sessionId, error });
    });
  }
}
