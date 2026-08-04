import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { hashPassword } from "../auth/password";
import { PrismaService } from "../database/prisma.service";
import { MembershipRole } from "../generated/prisma/client";
import {
  AcceptInvitationRequest,
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
  email: string;
  role: MembershipRole;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: { name: string };
}

const invitationColumns = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedBy: { select: { name: true } },
} as const;

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
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
 * until it expires, so acceptance is bound to the address it was issued for.
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
      where: { organizationId, user: { email: request.email } },
      select: { id: true },
    });

    if (existing != null) {
      throw new ConflictException(`${request.email} is already a member of this organization.`);
    }

    const token = generateInvitationToken();

    // Any outstanding invitation for the same address is withdrawn first, so
    // re-inviting somebody cannot leave two live links for one seat.
    const [, created] = await this.database.$transaction([
      this.database.invitation.updateMany({
        where: { organizationId, email: request.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.database.invitation.create({
        data: {
          organizationId,
          invitedById,
          email: request.email,
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
   * Redeems a link.
   *
   * @param viewerId - The signed-in account, when there is one. Signed out, the
   * request has to carry a name and password, and the account is created.
   */
  async accept(
    request: AcceptInvitationRequest,
    viewerId: string | undefined,
  ): Promise<{ organizationSlug: string; userId: string }> {
    const prefix = parseInvitationTokenPrefix(request.token);
    const stored =
      prefix == null
        ? null
        : await this.database.invitation.findUnique({
            where: { prefix },
            select: {
              id: true,
              organizationId: true,
              email: true,
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
      hashInvitationToken(request.token),
      stored?.tokenHash ?? ABSENT_INVITATION_HASH,
    );

    if (stored == null || !matches || stored.revokedAt != null || stored.acceptedAt != null) {
      throw new NotFoundException("That invitation link is not valid.");
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException("That invitation link has expired. Ask for a new one.");
    }

    const userId =
      viewerId == null
        ? await this.createInvitedAccount(stored.email, request)
        : await this.requireMatchingAccount(viewerId, stored.email);

    await this.database.$transaction([
      this.database.membership.create({
        data: { organizationId: stored.organizationId, userId, role: stored.role },
        select: { id: true },
      }),
      this.database.invitation.update({
        where: { id: stored.id },
        data: { acceptedAt: new Date() },
        select: { id: true },
      }),
    ]);

    return { organizationSlug: stored.organization.slug, userId };
  }

  private async createInvitedAccount(
    email: string,
    request: AcceptInvitationRequest,
  ): Promise<string> {
    if (request.name == null || request.password == null) {
      throw new UnauthorizedException(
        "Accepting this invitation needs a name and a password, or an existing session.",
      );
    }

    const existing = await this.database.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing != null) {
      // The address already has an account, so this is a sign-in problem rather
      // than a registration one. Saying so beats silently refusing the password.
      throw new ConflictException(
        "An account already exists for that address. Sign in first, then open the link again.",
      );
    }

    const created = await this.database.user.create({
      data: { email, name: request.name, passwordHash: await hashPassword(request.password) },
      select: { id: true },
    });

    return created.id;
  }

  private async requireMatchingAccount(viewerId: string, email: string): Promise<string> {
    const viewer = await this.database.user.findUnique({
      where: { id: viewerId },
      select: { email: true },
    });

    // Bound to the address it was issued for. Otherwise a forwarded link would
    // quietly add whoever happened to open it.
    if (viewer?.email !== email) {
      throw new ForbiddenException(
        `That invitation was issued for ${email}. Sign in as that account to accept it.`,
      );
    }

    return viewerId;
  }
}
