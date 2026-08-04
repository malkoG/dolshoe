import { randomUUID } from "node:crypto";

import { hashPassword } from "../src/auth/password";
import { SESSION_COOKIE_NAME } from "../src/auth/session-cookie";
import { generateSessionToken } from "../src/auth/session-token";
import { PrismaService } from "../src/database/prisma.service";
import { MembershipRole } from "../src/generated/prisma/client";
import { DEFAULT_ORGANIZATION_ID } from "../src/organizations/default-organization";

export interface SignedInViewer {
  /** Ready to hand to `.set("cookie", …)`. */
  readonly cookie: string;
  readonly userId: string;
}

/**
 * Creates an account, a membership, and a live session directly in the database.
 *
 * @remarks
 * Not through `POST /auth/register`, which only succeeds while an instance is
 * unclaimed and so cannot produce the second account a role test needs. Writing
 * the rows here is the same move `projects.e2e-spec.ts` already makes when it
 * hashes an ingestion token by hand to check what was stored.
 *
 * Shared rather than colocated because three suites need it. Each still owns its
 * own teardown: this returns the ids required to clean up.
 */
export async function signIn(
  database: PrismaService,
  options: { organizationId?: string; role?: MembershipRole } = {},
): Promise<SignedInViewer> {
  const user = await database.user.create({
    data: {
      email: `viewer-${randomUUID().slice(0, 8)}@example.com`,
      name: "Tester",
      passwordHash: await hashPassword("correct horse battery staple"),
      memberships: {
        create: {
          organizationId: options.organizationId ?? DEFAULT_ORGANIZATION_ID,
          role: options.role ?? MembershipRole.OWNER,
        },
      },
    },
    select: { id: true },
  });

  const token = generateSessionToken();
  await database.session.create({
    data: {
      userId: user.id,
      prefix: token.prefix,
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + 60_000),
    },
    select: { id: true },
  });

  return { cookie: `${SESSION_COOKIE_NAME}=${token.raw}`, userId: user.id };
}
