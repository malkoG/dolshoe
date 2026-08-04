import { UnauthorizedException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { generateProjectToken } from "./project-token";
import { ProjectTokenVerifier } from "./project-token.verifier";

const PROJECT = { id: "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e", slug: "checkout-api" };

function verifierFor(
  storedRow: unknown,
  update = jest.fn().mockResolvedValue({}),
): {
  verifier: ProjectTokenVerifier;
  findUnique: jest.Mock;
  update: jest.Mock;
} {
  const findUnique = jest.fn().mockResolvedValue(storedRow);
  const database = { projectToken: { findUnique, update } } as unknown as PrismaService;

  return { verifier: new ProjectTokenVerifier(database), findUnique, update };
}

function storedToken(
  hash: string,
  overrides: { lastUsedAt?: Date | null; revokedAt?: Date | null } = {},
): unknown {
  return {
    id: "c0ffee00-0000-4000-8000-000000000001",
    tokenHash: hash,
    lastUsedAt: overrides.lastUsedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    project: PROJECT,
  };
}

describe("ProjectTokenVerifier", () => {
  it("resolves a valid token to the project that owns it", async () => {
    const token = generateProjectToken();
    const { verifier, findUnique } = verifierFor(storedToken(token.hash));

    await expect(verifier.verify(token.raw, token.prefix)).resolves.toEqual(PROJECT);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { prefix: token.prefix } }),
    );
  });

  it("rejects an unknown prefix", async () => {
    const token = generateProjectToken();
    const { verifier } = verifierFor(null);

    await expect(verifier.verify(token.raw, token.prefix)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a known prefix presented with the wrong secret", async () => {
    const token = generateProjectToken();
    const impostor = generateProjectToken();
    const { verifier } = verifierFor(storedToken(token.hash));

    await expect(verifier.verify(impostor.raw, token.prefix)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a revoked token", async () => {
    const token = generateProjectToken();
    const { verifier } = verifierFor(
      storedToken(token.hash, { revokedAt: new Date("2026-08-01T00:00:00.000Z") }),
    );

    await expect(verifier.verify(token.raw, token.prefix)).rejects.toThrow(UnauthorizedException);
  });

  it("says no more about a revoked token than about an unknown one", async () => {
    const token = generateProjectToken();
    const revoked = verifierFor(storedToken(token.hash, { revokedAt: new Date() }));
    const unknown = verifierFor(null);

    const rejectionOf = async (verifier: ProjectTokenVerifier): Promise<Error> => {
      try {
        await verifier.verify(token.raw, token.prefix);
      } catch (error) {
        return error as Error;
      }
      throw new Error("Expected the token to be rejected.");
    };

    const revokedError = await rejectionOf(revoked.verifier);
    const unknownError = await rejectionOf(unknown.verifier);

    expect(revokedError).toBeInstanceOf(UnauthorizedException);
    expect(revokedError.message).toBe(unknownError.message);
  });

  it("records a first use", async () => {
    const token = generateProjectToken();
    const { verifier, update } = verifierFor(storedToken(token.hash));

    await verifier.verify(token.raw, token.prefix);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c0ffee00-0000-4000-8000-000000000001" } }),
    );
  });

  it("skips the write when the recorded use is still fresh", async () => {
    const token = generateProjectToken();
    const { verifier, update } = verifierFor(storedToken(token.hash, { lastUsedAt: new Date() }));

    await verifier.verify(token.raw, token.prefix);

    expect(update).not.toHaveBeenCalled();
  });

  it("still authorizes when recording the use fails", async () => {
    const token = generateProjectToken();
    const update = jest.fn().mockRejectedValue(new Error("connection reset"));
    const { verifier } = verifierFor(storedToken(token.hash), update);

    await expect(verifier.verify(token.raw, token.prefix)).resolves.toEqual(PROJECT);
  });
});
