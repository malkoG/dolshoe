import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { SignInRefusedError } from "../auth/sign-in-refusal";
import { PrismaService } from "../database/prisma.service";
import { MembershipRole } from "../generated/prisma/client";
import {
  CreateInvitationRequest,
  Invitation,
  InvitationListResponse,
  IssuedInvitation,
} from "./organization.contract";
import {
  ABSENT_INVITATION_HASH,
  generateInvitationToken,
  hashInvitationToken,
  parseInvitationTokenPrefix,
} from "./invitation-token";
import { hashesMatch } from "../credentials/opaque-token";

/**
 * Long enough to survive a weekend and a forwarded message, short enough that a
 * link found later in someone's inbox is not still a way in.
 */
const INVITATION_LIFETIME_DAYS = 7;

interface InvitationRow {
  id: string;
  githubLogin: string;
  role: MembershipRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: { name: string };
}

const invitationColumns = {
  id: true,
  githubLogin: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedBy: { select: { name: true } },
} as const;

/**
 * An invitation that has been checked and is ready to spend.
 *
 * @remarks
 * Separated from redeeming it because the sign-in flow has to know a link is
 * good *before* it creates the account that will redeem it — otherwise a bad
 * link would leave a stranded account behind on an instance that admits nobody
 * without one.
 */
export interface RedeemableInvitation {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly githubLogin: string;
  readonly role: MembershipRole;
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    githubLogin: row.githubLogin,
    role: row.role,
    invitedBy: row.invitedBy.name,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Issues and redeems the links that add people to an organization.
 *
 * @remarks
 * Dolshoe sends no email. The link is returned once and the operator delivers it
 * however they already talk to their colleagues — which is what keeps SMTP
 * configuration, a delivery queue, and bounce handling out of a self-hosted
 * install. The trade is that a link sent to the wrong person is a real way in
 * until it expires, so acceptance is bound to the GitHub login it was issued
 * for.
 *
 * A login rather than an address, because a login is the identity the invitee
 * will actually arrive with: GitHub is the only way to sign in, and an address
 * only ever reached Dolshoe as a by-product of that. The login is resolved
 * against the account redeeming it, so a handle that changes hands between issue
 * and acceptance cannot be used to claim somebody else's seat.
 */
@Injectable()
export class InvitationService {
  constructor(private readonly database: PrismaService) {}

  async list(organizationId: string): Promise<InvitationListResponse> {
    const rows = await this.database.invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: invitationColumns,
    });

    return { invitations: rows.map(toInvitation) };
  }

  async create(
    organizationId: string,
    invitedById: string,
    request: CreateInvitationRequest,
  ): Promise<IssuedInvitation> {
    const existing = await this.database.membership.findFirst({
      where: { organizationId, user: { githubLogin: request.githubLogin } },
      select: { id: true },
    });

    if (existing != null) {
      throw new ConflictException(
        `${request.githubLogin} is already a member of this organization.`,
      );
    }

    const token = generateInvitationToken();

    // Any outstanding invitation for the same login is withdrawn first, so
    // re-inviting somebody cannot leave two live links for one seat.
    const [, created] = await this.database.$transaction([
      this.database.invitation.updateMany({
        where: {
          organizationId,
          githubLogin: request.githubLogin,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
      this.database.invitation.create({
        data: {
          organizationId,
          invitedById,
          githubLogin: request.githubLogin,
          role: request.role,
          prefix: token.prefix,
          tokenHash: token.hash,
          expiresAt: new Date(Date.now() + INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1_000),
        },
        select: invitationColumns,
      }),
    ]);

    return {
      ...toInvitation(created),
      invitationUrl: `/invitations/${token.raw}`,
    };
  }

  /**
   * Revocation is idempotent, so a retried or double-clicked request returns the
   * original timestamp rather than failing.
   */
  async revoke(organizationId: string, invitationId: string): Promise<Invitation> {
    const existing = await this.database.invitation.findFirst({
      where: { id: invitationId, organizationId },
      select: invitationColumns,
    });

    if (existing == null) {
      throw new NotFoundException(
        `No invitation exists with the id ${invitationId} in this organization.`,
      );
    }

    if (existing.revokedAt != null) return toInvitation(existing);

    const revoked = await this.database.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
      select: invitationColumns,
    });

    return toInvitation(revoked);
  }

  /**
   * Checks a link without spending it, as part of signing in.
   *
   * @remarks
   * Refusals are {@link SignInRefusedError}s rather than HTTP exceptions because
   * the caller is mid-redirect: the browser is on its way back from GitHub and
   * has to land on the sign-in page with a reason, not on an API error body.
   *
   * A link that is not for this account is reported separately from one that is
   * not valid at all. Both are safe to say — whoever holds the link already has
   * it — and telling somebody their handle does not match is the difference
   * between a fixable mistake and a mystery.
   */
  async findRedeemable(token: string, githubLogin: string): Promise<RedeemableInvitation> {
    const stored = await this.findLive(token);

    if (stored == null) {
      throw new SignInRefusedError(
        "invitation_invalid",
        "That invitation link is not valid, or it has expired.",
      );
    }

    if (stored.githubLogin !== githubLogin.toLowerCase()) {
      throw new SignInRefusedError(
        "invitation_mismatch",
        `That invitation was issued for @${stored.githubLogin}.`,
      );
    }

    return stored;
  }

  /**
   * Spends a checked link: grants the membership and marks the invitation used.
   *
   * @remarks
   * One transaction, so a link can never be marked accepted without the
   * membership it was accepted for. Both statements are idempotent, which is
   * what makes two tabs redeeming the same link at once settle on one membership
   * rather than fail the second with a duplicate key the person would read as a
   * broken invitation.
   */
  async redeem(
    invitation: RedeemableInvitation,
    userId: string,
  ): Promise<{ organizationSlug: string }> {
    await this.database.$transaction([
      this.database.membership.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
        // Already a member: the invitation is still spent, but an existing role
        // is not quietly rewritten by a link somebody kept.
        update: {},
        create: { organizationId: invitation.organizationId, userId, role: invitation.role },
        select: { id: true },
      }),
      this.database.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return { organizationSlug: invitation.organizationSlug };
  }

  /**
   * Redeems a link for somebody who is already signed in.
   *
   * @remarks
   * The signed-out case does not exist any more: an account can only be
   * established through GitHub, so a link opened by a stranger is redeemed as
   * part of `auth/github/start?invitation=…` instead. This is the path for
   * somebody who already has an account and is joining another organization.
   */
  async acceptAsViewer(
    token: string,
    viewer: { id: string; githubLogin: string | null },
  ): Promise<{ organizationSlug: string }> {
    const stored = await this.findLive(token);

    if (stored == null) {
      throw new NotFoundException("That invitation link is not valid, or it has expired.");
    }

    // Bound to the account it was issued for. Otherwise a forwarded link would
    // quietly add whoever happened to open it.
    if (viewer.githubLogin == null || stored.githubLogin !== viewer.githubLogin) {
      throw new ForbiddenException(
        `That invitation was issued for @${stored.githubLogin}. Sign in as that account to accept it.`,
      );
    }

    return this.redeem(stored, viewer.id);
  }

  /**
   * Resolves a token to an invitation that can still be spent, or null.
   *
   * @remarks
   * Unknown, revoked, spent, and expired all collapse to null. They differ only
   * in ways the holder of a dead link can do nothing about, and distinguishing
   * them would turn this into an oracle for which links exist.
   */
  private async findLive(token: string): Promise<RedeemableInvitation | null> {
    const prefix = parseInvitationTokenPrefix(token);
    const stored =
      prefix == null
        ? null
        : await this.database.invitation.findUnique({
            where: { prefix },
            select: {
              id: true,
              organizationId: true,
              githubLogin: true,
              role: true,
              tokenHash: true,
              expiresAt: true,
              acceptedAt: true,
              revokedAt: true,
              organization: { select: { slug: true } },
            },
          });

    // Compared even when nothing was found, so a prefix that exists costs the
    // same as one that does not.
    const matches = hashesMatch(
      hashInvitationToken(token),
      stored?.tokenHash ?? ABSENT_INVITATION_HASH,
    );

    if (stored == null || !matches || stored.revokedAt != null || stored.acceptedAt != null) {
      return null;
    }

    if (stored.expiresAt.getTime() <= Date.now()) return null;

    return {
      id: stored.id,
      organizationId: stored.organizationId,
      organizationSlug: stored.organization.slug,
      githubLogin: stored.githubLogin,
      role: stored.role,
    };
  }
}
