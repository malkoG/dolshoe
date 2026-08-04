import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { attachViewer } from "../auth/viewer";
import { PrismaService } from "../database/prisma.service";
import { MembershipRole } from "../generated/prisma/client";
import { readCurrentOrganization } from "./current-organization";
import { OrgMembershipGuard } from "./org-membership.guard";
import { OWNER_OR_ADMIN } from "./require-org-role";

const VIEWER = {
  id: "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e",
  email: "ops@example.com",
  name: "Ops",
  sessionId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
};

const ORGANIZATION = {
  id: "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  slug: "acme",
  name: "Acme Payments",
  createdAt: new Date("2026-08-04T09:00:00.000Z"),
};

interface TestRequest {
  params?: Record<string, string>;
}

function requestContext(
  request: TestRequest,
  options: { signedIn?: boolean } = {},
): { context: ExecutionContext; request: TestRequest } {
  if (options.signedIn !== false) attachViewer(request, VIEWER);

  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      // Only ever handed to the stubbed Reflector, which ignores them.
      getHandler: () => () => undefined,
      getClass: () => OrgMembershipGuard,
    } as unknown as ExecutionContext,
    request,
  };
}

function guardWith(findUnique: jest.Mock, required?: MembershipRole[]): OrgMembershipGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;

  return new OrgMembershipGuard(
    { organization: { findUnique } } as unknown as PrismaService,
    reflector,
  );
}

function organizationWith(role: MembershipRole | undefined) {
  return { ...ORGANIZATION, memberships: role == null ? [] : [{ role }] };
}

describe("OrgMembershipGuard", () => {
  it("resolves the organization and the viewer's role in it", async () => {
    const findUnique = jest.fn().mockResolvedValue(organizationWith(MembershipRole.MEMBER));
    const { context, request } = requestContext({ params: { orgSlug: "acme" } });

    await expect(guardWith(findUnique).canActivate(context)).resolves.toBe(true);

    expect(readCurrentOrganization(request)).toEqual({
      id: ORGANIZATION.id,
      slug: "acme",
      name: "Acme Payments",
      createdAt: ORGANIZATION.createdAt,
      role: MembershipRole.MEMBER,
    });
  });

  it("reports an organization the viewer does not belong to as not found", async () => {
    // Not forbidden. An organization somebody else owns has to look exactly
    // like one that does not exist, or the status code enumerates tenants.
    const findUnique = jest.fn().mockResolvedValue(organizationWith(undefined));
    const { context } = requestContext({ params: { orgSlug: "acme" } });

    await expect(guardWith(findUnique).canActivate(context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("reports an organization that does not exist the same way", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const { context } = requestContext({ params: { orgSlug: "acme" } });

    await expect(guardWith(findUnique).canActivate(context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("refuses a member whose role is below what the route requires", async () => {
    // Forbidden, not 404: the viewer can already see this organization, so
    // naming what they lack reveals nothing and saves them guessing.
    const findUnique = jest.fn().mockResolvedValue(organizationWith(MembershipRole.MEMBER));
    const { context } = requestContext({ params: { orgSlug: "acme" } });

    await expect(guardWith(findUnique, OWNER_OR_ADMIN).canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN])(
    "admits %s to a restricted route",
    async (role) => {
      const findUnique = jest.fn().mockResolvedValue(organizationWith(role));
      const { context } = requestContext({ params: { orgSlug: "acme" } });

      await expect(guardWith(findUnique, OWNER_OR_ADMIN).canActivate(context)).resolves.toBe(true);
    },
  );

  it("admits any member to a route with no role requirement", async () => {
    const findUnique = jest.fn().mockResolvedValue(organizationWith(MembershipRole.MEMBER));
    const { context } = requestContext({ params: { orgSlug: "acme" } });

    await expect(guardWith(findUnique).canActivate(context)).resolves.toBe(true);
  });

  it("fails loudly when the session guard did not run first", async () => {
    const findUnique = jest.fn();
    const { context } = requestContext({ params: { orgSlug: "acme" } }, { signedIn: false });

    await expect(guardWith(findUnique).canActivate(context)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("fails loudly when it guards a route with no orgSlug in its path", async () => {
    const findUnique = jest.fn();
    const { context } = requestContext({ params: {} });

    await expect(guardWith(findUnique).canActivate(context)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
