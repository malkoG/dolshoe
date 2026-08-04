import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { hashProjectToken } from "./project-token";
import { ProjectService } from "./project.service";

const ORGANIZATION_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";
const TOKEN_ID = "b7c4e8a1-2d3f-4a5b-8c6d-9e0f1a2b3c4d";
const CREATED_AT = new Date("2026-08-04T09:00:00.000Z");

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("constraint failed", {
    code,
    clientVersion: "7.9.0",
  });
}

function serviceWith(database: unknown): ProjectService {
  return new ProjectService(database as PrismaService);
}

describe("ProjectService.create", () => {
  it("derives the slug from the name when one is not supplied", async () => {
    const create = jest.fn().mockResolvedValue({
      id: PROJECT_ID,
      slug: "checkout-api",
      name: "Checkout API",
      createdAt: CREATED_AT,
    });
    const service = serviceWith({ project: { create } });

    await expect(service.create(ORGANIZATION_ID, { name: "Checkout API" })).resolves.toEqual({
      id: PROJECT_ID,
      slug: "checkout-api",
      name: "Checkout API",
      createdAt: "2026-08-04T09:00:00.000Z",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organizationId: ORGANIZATION_ID, slug: "checkout-api", name: "Checkout API" },
      }),
    );
  });

  it("keeps an explicitly supplied slug", async () => {
    const create = jest.fn().mockResolvedValue({
      id: PROJECT_ID,
      slug: "checkout",
      name: "Checkout API",
      createdAt: CREATED_AT,
    });
    const service = serviceWith({ project: { create } });

    await service.create(ORGANIZATION_ID, { name: "Checkout API", slug: "checkout" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organizationId: ORGANIZATION_ID, slug: "checkout", name: "Checkout API" },
      }),
    );
  });

  it("reports a taken slug as a conflict naming the slug", async () => {
    const create = jest.fn().mockRejectedValue(prismaError("P2002"));
    const service = serviceWith({ project: { create } });

    await expect(service.create(ORGANIZATION_ID, { name: "Checkout API" })).rejects.toThrow(
      ConflictException,
    );
    await expect(service.create(ORGANIZATION_ID, { name: "Checkout API" })).rejects.toThrow(
      /checkout-api/,
    );
  });

  it("rejects a name no slug can be derived from", async () => {
    const create = jest.fn();
    const service = serviceWith({ project: { create } });

    await expect(service.create(ORGANIZATION_ID, { name: "!!!" })).rejects.toThrow(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("does not disguise an unexpected database failure", async () => {
    const create = jest.fn().mockRejectedValue(new Error("connection reset"));
    const service = serviceWith({ project: { create } });

    await expect(service.create(ORGANIZATION_ID, { name: "Checkout API" })).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("ProjectService.issueToken", () => {
  it("stores a digest and returns a plaintext that is not the stored value", async () => {
    const create = jest.fn().mockImplementation(({ data }: { data: { prefix: string } }) =>
      Promise.resolve({
        id: TOKEN_ID,
        name: "production",
        prefix: data.prefix,
        createdAt: CREATED_AT,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    const service = serviceWith({
      project: { findFirst: jest.fn().mockResolvedValue({ id: PROJECT_ID }) },
      projectToken: { create },
    });

    const issued = await service.issueToken(ORGANIZATION_ID, PROJECT_ID, { name: "production" });

    const stored = create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(hashProjectToken(issued.token));
    expect(stored.tokenHash).not.toBe(issued.token);
    expect(issued.token).toContain(stored.prefix);
    expect(issued.revokedAt).toBeNull();
  });

  it("reports a project in another organization as not found", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn();
    const service = serviceWith({ project: { findFirst }, projectToken: { create } });

    await expect(
      service.issueToken(ORGANIZATION_ID, PROJECT_ID, { name: "production" }),
    ).rejects.toThrow(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it("reports a project deleted mid-request as not found", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: PROJECT_ID });
    const create = jest.fn().mockRejectedValue(prismaError("P2003"));
    const service = serviceWith({ project: { findFirst }, projectToken: { create } });

    await expect(
      service.issueToken(ORGANIZATION_ID, PROJECT_ID, { name: "production" }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("ProjectService.revokeToken", () => {
  const activeToken = {
    id: TOKEN_ID,
    name: "production",
    prefix: "a1b2c3d4e5f6",
    createdAt: CREATED_AT,
    lastUsedAt: null,
    revokedAt: null,
  };

  it("revokes an active token", async () => {
    const findFirst = jest.fn().mockResolvedValue(activeToken);
    const update = jest
      .fn()
      .mockResolvedValue({ ...activeToken, revokedAt: new Date("2026-08-04T10:00:00.000Z") });
    const service = serviceWith({ projectToken: { findFirst, update } });

    await expect(service.revokeToken(ORGANIZATION_ID, PROJECT_ID, TOKEN_ID)).resolves.toMatchObject(
      {
        revokedAt: "2026-08-04T10:00:00.000Z",
      },
    );
  });

  it("is idempotent, keeping the original revocation time", async () => {
    const alreadyRevoked = { ...activeToken, revokedAt: new Date("2026-08-04T10:00:00.000Z") };
    const findFirst = jest.fn().mockResolvedValue(alreadyRevoked);
    const update = jest.fn();
    const service = serviceWith({ projectToken: { findFirst, update } });

    await expect(service.revokeToken(ORGANIZATION_ID, PROJECT_ID, TOKEN_ID)).resolves.toMatchObject(
      {
        revokedAt: "2026-08-04T10:00:00.000Z",
      },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a token that belongs to another project or organization as not found", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = serviceWith({ projectToken: { findFirst, update: jest.fn() } });

    await expect(service.revokeToken(ORGANIZATION_ID, PROJECT_ID, TOKEN_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("ProjectService.listTokens", () => {
  it("never exposes a stored digest", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: PROJECT_ID });
    const findMany = jest.fn().mockResolvedValue([
      {
        id: TOKEN_ID,
        name: "production",
        prefix: "a1b2c3d4e5f6",
        createdAt: CREATED_AT,
        lastUsedAt: new Date("2026-08-04T09:05:00.000Z"),
        revokedAt: null,
      },
    ]);
    const service = serviceWith({
      project: { findFirst },
      projectToken: { findMany },
    });

    const { tokens } = await service.listTokens(ORGANIZATION_ID, PROJECT_ID);

    expect(tokens).toEqual([
      {
        id: TOKEN_ID,
        name: "production",
        prefix: "a1b2c3d4e5f6",
        createdAt: "2026-08-04T09:00:00.000Z",
        lastUsedAt: "2026-08-04T09:05:00.000Z",
        revokedAt: null,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.objectContaining({ tokenHash: true }) }),
    );
  });

  it("reports a project in another organization as not found", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = serviceWith({ project: { findFirst }, projectToken: { findMany: jest.fn() } });

    await expect(service.listTokens(ORGANIZATION_ID, PROJECT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
