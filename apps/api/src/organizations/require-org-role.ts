import { Reflector } from "@nestjs/core";

import { MembershipRole } from "../generated/prisma/client";

/**
 * Declares the minimum role a handler needs in the organization named in its
 * path.
 *
 * @remarks
 * Absent means "any member": reading what an organization has recorded is open
 * to everyone in it, and only writes narrow it further. A typed reflector
 * decorator rather than a string metadata key, so a mismatch is a compile error
 * rather than a route that silently authorizes everyone.
 */
export const RequireOrgRole = Reflector.createDecorator<MembershipRole[]>();

/** Everything that changes an organization or the credentials inside it. */
export const OWNER_OR_ADMIN: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN];

export const OWNER_ONLY: MembershipRole[] = [MembershipRole.OWNER];
