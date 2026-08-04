import {
  ExecutionContext,
  InternalServerErrorException,
  createParamDecorator,
} from "@nestjs/common";

import { MembershipRole } from "../generated/prisma/client";

/** The organization a request is acting in, and what the viewer may do in it. */
export interface OrganizationContext {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: Date;
  /** The current viewer's role here, not a property of the organization. */
  readonly role: MembershipRole;
}

const CURRENT_ORGANIZATION = Symbol.for("dolshoe.currentOrganization");

type RequestWithOrganization = Record<PropertyKey, unknown> & {
  [CURRENT_ORGANIZATION]?: OrganizationContext;
};

export function attachCurrentOrganization(
  request: object,
  organization: OrganizationContext,
): void {
  (request as RequestWithOrganization)[CURRENT_ORGANIZATION] = organization;
}

export function readCurrentOrganization(request: object): OrganizationContext | undefined {
  return (request as RequestWithOrganization)[CURRENT_ORGANIZATION];
}

/**
 * Supplies the organization resolved by `OrgMembershipGuard`.
 *
 * @remarks
 * Throws rather than yielding `undefined`, for the same reason `@IngestProject()`
 * does: a controller silently receiving `undefined` here would query across
 * every tenant instead of one.
 */
export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrganizationContext => {
    const request = context.switchToHttp().getRequest<object>();
    const organization = readCurrentOrganization(request);

    if (organization == null) {
      throw new InternalServerErrorException(
        "No organization was resolved for this request. @CurrentOrganization() requires OrgMembershipGuard on the same handler.",
      );
    }

    return organization;
  },
);
