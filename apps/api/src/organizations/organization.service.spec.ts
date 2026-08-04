import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { MembershipRole, Prisma } from "../generated/prisma/client";
import { OrganizationService } from "./organization.service";

const ORGANIZATION_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const USER_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";
const CREATED_AT = new Date("2026-08-04T09:00:00.000Z");

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("constraint failed", {
    code,
    clientVersion: "7.9.0",
  });
}

function serviceWith(database: unknown): OrganizationService {
  return new OrganizationService(database as PrismaService);
}

describe("OrganizationService.create", () => {
  it("derives the slug and makes the creator its owner", async () => {
    const create = jest.fn().mockResolvedValue({
      id: ORGANIZATION_ID,
      slug: "acme-payments",
      name: "Acme Payments",
      createdAt: CREATED_AT,
    });

    await expect(
      serviceWith({ organization: { create } }).create(USER_ID, { name: "Acme Payments" }),
    ).resolves.toEqual({
      id: ORGANIZATION_ID,
      slug: "acme-payments",
      name: "Acme Payments",
      role: MembershipRole.OWNER,
      createdAt: "2026-08-04T09:00:00.000Z",
    });

    // One statement, so an organization cannot exist with nobody able to
    // administer it.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberships: { create: { userId: USER_ID, role: MembershipRole.OWNER } },
        }),
      }),
    );
  });

  it("reports a taken slug as a conflict naming the slug", async () => {
    const create = jest.fn().mockRejectedValue(prismaError("P2002"));

    await expect(
      serviceWith({ organization: { create } }).create(USER_ID, { name: "Acme Payments" }),
    ).rejects.toThrow(/acme-payments/);
  });

  it("rejects a name no slug can be derived from", async () => {
    const create = jest.fn();

    await expect(
      serviceWith({ organization: { create } }).create(USER_ID, { name: "!!!" }),
    ).rejects.toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("OrganizationService.updateMemberRole", () => {
  function serviceForMember(role: MembershipRole, otherOwners = 1) {
    const update = jest.fn().mockResolvedValue({
      role: MembershipRole.ADMIN,
      createdAt: CREATED_AT,
      user: { id: USER_ID, email: "ops@example.com", name: "Ops" },
    });

    return {
      update,
      service: serviceWith({
        membership: {
          findUnique: jest.fn().mockResolvedValue({ role }),
          count: jest.fn().mockResolvedValue(otherOwners),
          update,
        },
      }),
    };
  }

  it("lets an owner promote a member", async () => {
    const { service } = serviceForMember(MembershipRole.MEMBER);

    await expect(
      service.updateMemberRole(
        ORGANIZATION_ID,
        MembershipRole.OWNER,
        USER_ID,
        MembershipRole.ADMIN,
      ),
    ).resolves.toMatchObject({ role: MembershipRole.ADMIN });
  });

  it("refuses to let an admin grant ownership", async () => {
    // The one thing that separates the two roles: an admin cannot promote
    // themselves past the people who appointed them.
    const { service, update } = serviceForMember(MembershipRole.MEMBER);

    await expect(
      service.updateMemberRole(
        ORGANIZATION_ID,
        MembershipRole.ADMIN,
        USER_ID,
        MembershipRole.OWNER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to let an admin demote an owner", async () => {
    const { service } = serviceForMember(MembershipRole.OWNER);

    await expect(
      service.updateMemberRole(
        ORGANIZATION_ID,
        MembershipRole.ADMIN,
        USER_ID,
        MembershipRole.MEMBER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to demote the last owner", async () => {
    // An organization with no owner could not be administered by anyone, and
    // nothing else in the system can appoint one.
    const { service } = serviceForMember(MembershipRole.OWNER, 0);

    await expect(
      service.updateMemberRole(
        ORGANIZATION_ID,
        MembershipRole.OWNER,
        USER_ID,
        MembershipRole.ADMIN,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports someone who is not a member as not found", async () => {
    const service = serviceWith({
      membership: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.updateMemberRole(
        ORGANIZATION_ID,
        MembershipRole.OWNER,
        USER_ID,
        MembershipRole.ADMIN,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OrganizationService.removeMember", () => {
  function serviceForMember(role: MembershipRole, otherOwners = 1) {
    const remove = jest.fn().mockResolvedValue({});

    return {
      remove,
      service: serviceWith({
        membership: {
          findUnique: jest.fn().mockResolvedValue({ role }),
          count: jest.fn().mockResolvedValue(otherOwners),
          delete: remove,
        },
      }),
    };
  }

  it("removes an ordinary member", async () => {
    const { service, remove } = serviceForMember(MembershipRole.MEMBER);

    await service.removeMember(ORGANIZATION_ID, MembershipRole.ADMIN, USER_ID);

    expect(remove).toHaveBeenCalled();
  });

  it("refuses to let an admin remove an owner", async () => {
    const { service, remove } = serviceForMember(MembershipRole.OWNER);

    await expect(
      service.removeMember(ORGANIZATION_ID, MembershipRole.ADMIN, USER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses to remove the last owner", async () => {
    const { service } = serviceForMember(MembershipRole.OWNER, 0);

    await expect(
      service.removeMember(ORGANIZATION_ID, MembershipRole.OWNER, USER_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("OrganizationService.listForViewer", () => {
  it("lists only what the viewer belongs to, with their role in each", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        role: MembershipRole.ADMIN,
        organization: {
          id: ORGANIZATION_ID,
          slug: "acme",
          name: "Acme Payments",
          createdAt: CREATED_AT,
        },
      },
    ]);

    await expect(serviceWith({ membership: { findMany } }).listForViewer(USER_ID)).resolves.toEqual(
      {
        organizations: [
          {
            id: ORGANIZATION_ID,
            slug: "acme",
            name: "Acme Payments",
            role: MembershipRole.ADMIN,
            createdAt: "2026-08-04T09:00:00.000Z",
          },
        ],
      },
    );
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER_ID } }));
  });
});
