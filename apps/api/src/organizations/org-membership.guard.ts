import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { readViewer } from "../auth/viewer";
import { PrismaService } from "../database/prisma.service";
import { attachCurrentOrganization } from "./current-organization";
import { RequireOrgRole } from "./require-org-role";

interface OrganizationRequest {
  params?: Record<string, string | undefined>;
}

/**
 * Resolves the organization named in the path and authorizes the viewer in it.
 *
 * @remarks
 * Runs after `SessionAuthGuard` — `@UseGuards(SessionAuthGuard,
 * OrgMembershipGuard)` executes left to right — and one query answers both
 * questions, because there is no reason to look up an organization separately
 * from whether the caller belongs to it.
 */
@Injectable()
export class OrgMembershipGuard implements CanActivate {
  constructor(
    private readonly database: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const viewer = readViewer(request);

    if (viewer == null) {
      throw new InternalServerErrorException(
        "No viewer was resolved for this request. OrgMembershipGuard requires SessionAuthGuard on the same handler.",
      );
    }

    const slug = request.params?.orgSlug;
    if (slug == null) {
      throw new InternalServerErrorException(
        "OrgMembershipGuard requires an :orgSlug path parameter on the route it guards.",
      );
    }

    const organization = await this.database.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        createdAt: true,
        memberships: { where: { userId: viewer.id }, select: { role: true } },
      },
    });

    // Not a member reads as not found. An organization somebody else owns has to
    // be indistinguishable from one that does not exist, or the status code
    // itself becomes a way to enumerate tenants.
    const membership = organization?.memberships[0];
    if (organization == null || membership == null) {
      throw new NotFoundException(`No organization exists with the slug "${slug}".`);
    }

    // Insufficient role reads as forbidden, unlike the above. The viewer can
    // already see this organization, so naming what they lack tells them
    // nothing they could not learn by looking, and saves them guessing.
    const required = this.reflector.getAllAndOverride(RequireOrgRole, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required != null && !required.includes(membership.role)) {
      throw new ForbiddenException(
        `This action requires the ${required.join(" or ")} role in "${slug}".`,
      );
    }

    attachCurrentOrganization(request, {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      createdAt: organization.createdAt,
      role: membership.role,
    });

    return true;
  }
}
