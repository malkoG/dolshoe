import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { MembershipRole, Prisma } from "../generated/prisma/client";
import { deriveProjectSlug } from "../projects/project-slug";
import {
  CreateOrganizationRequest,
  Member,
  MemberListResponse,
  Organization,
  OrganizationListResponse,
} from "./organization.contract";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

interface MemberRow {
  role: MembershipRole;
  createdAt: Date;
  user: { id: string; email: string; name: string };
}

function toOrganization(row: OrganizationRow, role: MembershipRole): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMember(row: MemberRow): Member {
  return {
    userId: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.role,
    joinedAt: row.createdAt.toISOString(),
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class OrganizationService {
  constructor(private readonly database: PrismaService) {}

  /**
   * Lists what the viewer can actually reach. There is no "all organizations"
   * listing: an instance administrator is a second authorization axis this
   * design does not have.
   */
  async listForViewer(userId: string): Promise<OrganizationListResponse> {
    const rows = await this.database.membership.findMany({
      where: { userId },
      orderBy: { organization: { createdAt: "desc" } },
      select: {
        role: true,
        organization: { select: { id: true, slug: true, name: true, createdAt: true } },
      },
    });

    return {
      organizations: rows.map((row) => toOrganization(row.organization, row.role)),
    };
  }

  async create(userId: string, request: CreateOrganizationRequest): Promise<Organization> {
    const slug = request.slug ?? this.deriveSlug(request.name);

    try {
      const created = await this.database.organization.create({
        data: {
          slug,
          name: request.name,
          // The creator is its owner. Written in the same statement so an
          // organization can never exist with nobody able to administer it.
          memberships: { create: { userId, role: MembershipRole.OWNER } },
        },
        select: { id: true, slug: true, name: true, createdAt: true },
      });

      return toOrganization(created, MembershipRole.OWNER);
    } catch (error) {
      if (isPrismaError(error, UNIQUE_CONSTRAINT_VIOLATION)) {
        throw new ConflictException(`An organization with the slug "${slug}" already exists.`);
      }
      throw error;
    }
  }

  async listMembers(organizationId: string): Promise<MemberListResponse> {
    const rows = await this.database.membership.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return { members: rows.map(toMember) };
  }

  /**
   * Changes a member's role.
   *
   * @remarks
   * Only an owner may grant or withdraw ownership. An admin can manage everyone
   * below them but cannot promote themselves past the people who invited them,
   * which is the whole distinction between the two roles.
   */
  async updateMemberRole(
    organizationId: string,
    actorRole: MembershipRole,
    userId: string,
    role: MembershipRole,
  ): Promise<Member> {
    const existing = await this.requireMembership(organizationId, userId);

    if (actorRole !== MembershipRole.OWNER) {
      if (role === MembershipRole.OWNER || existing.role === MembershipRole.OWNER) {
        throw new ForbiddenException("Only an owner can grant or withdraw ownership.");
      }
    }

    if (existing.role === MembershipRole.OWNER && role !== MembershipRole.OWNER) {
      await this.refuseIfLastOwner(organizationId, userId);
    }

    const updated = await this.database.membership.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return toMember(updated);
  }

  async removeMember(
    organizationId: string,
    actorRole: MembershipRole,
    userId: string,
  ): Promise<void> {
    const existing = await this.requireMembership(organizationId, userId);

    if (existing.role === MembershipRole.OWNER) {
      if (actorRole !== MembershipRole.OWNER) {
        throw new ForbiddenException("Only an owner can remove an owner.");
      }
      await this.refuseIfLastOwner(organizationId, userId);
    }

    await this.database.membership.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  private async requireMembership(
    organizationId: string,
    userId: string,
  ): Promise<{ role: MembershipRole }> {
    const membership = await this.database.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });

    if (membership == null) {
      throw new NotFoundException(`No member exists with the id ${userId} in this organization.`);
    }

    return membership;
  }

  /**
   * An organization without an owner cannot be administered by anyone, and
   * nothing else in the system can restore one, so the last owner is not allowed
   * to step down or be removed.
   */
  private async refuseIfLastOwner(organizationId: string, userId: string): Promise<void> {
    const otherOwners = await this.database.membership.count({
      where: { organizationId, role: MembershipRole.OWNER, userId: { not: userId } },
    });

    if (otherOwners === 0) {
      throw new ConflictException(
        "This is the organization's last owner. Promote another member to owner first.",
      );
    }
  }

  private deriveSlug(name: string): string {
    try {
      return deriveProjectSlug(name);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : "Could not derive a slug from the organization name.",
      );
    }
  }
}
