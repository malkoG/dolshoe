import { UnauthorizedException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { SessionService } from "./session.service";
import { generateSessionToken } from "./session-token";

const USER = { id: "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e", email: "ops@example.com", name: "Ops" };

function serviceWith(database: unknown): SessionService {
  return new SessionService(database as PrismaService);
}

function storedSession(overrides: { tokenHash: string; lastUsedAt?: Date; expiresAt?: Date }) {
  return {
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    tokenHash: overrides.tokenHash,
    lastUsedAt: overrides.lastUsedAt ?? new Date(),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    user: USER,
  };
}

describe("SessionService.create", () => {
  it("stores only the digest and returns the token once", async () => {
    const create = jest.fn().mockResolvedValue({ id: "session" });
    const session = await serviceWith({ session: { create } }).create(USER.id);

    const stored = create.mock.calls[0][0].data;
    expect(stored.tokenHash).not.toBe(session.token);
    expect(session.token).toContain(stored.prefix);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("SessionService.verify", () => {
  it("returns the viewer behind a valid session", async () => {
    const token = generateSessionToken();
    const findUnique = jest.fn().mockResolvedValue(storedSession({ tokenHash: token.hash }));
    const update = jest.fn().mockResolvedValue({});

    const viewer = await serviceWith({ session: { findUnique, update } }).verify(
      token.raw,
      token.prefix,
    );

    expect(viewer).toEqual({ ...USER, sessionId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" });
  });

  it("refuses an unknown prefix, still comparing against a stand-in digest", async () => {
    const token = generateSessionToken();
    const findUnique = jest.fn().mockResolvedValue(null);

    await expect(
      serviceWith({ session: { findUnique } }).verify(token.raw, token.prefix),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a prefix whose secret does not match", async () => {
    const token = generateSessionToken();
    const other = generateSessionToken();
    const findUnique = jest.fn().mockResolvedValue(storedSession({ tokenHash: other.hash }));

    await expect(
      serviceWith({ session: { findUnique } }).verify(token.raw, token.prefix),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses an expired session and discards the row", async () => {
    const token = generateSessionToken();
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        storedSession({ tokenHash: token.hash, expiresAt: new Date(Date.now() - 1) }),
      );
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });

    await expect(
      serviceWith({ session: { findUnique, deleteMany } }).verify(token.raw, token.prefix),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" },
    });
  });

  it("refreshes last-used only once the interval has passed", async () => {
    const token = generateSessionToken();
    const update = jest.fn().mockResolvedValue({});

    const fresh = jest.fn().mockResolvedValue(storedSession({ tokenHash: token.hash }));
    await serviceWith({ session: { findUnique: fresh, update } }).verify(token.raw, token.prefix);
    expect(update).not.toHaveBeenCalled();

    const stale = jest
      .fn()
      .mockResolvedValue(
        storedSession({ tokenHash: token.hash, lastUsedAt: new Date(Date.now() - 120_000) }),
      );
    await serviceWith({ session: { findUnique: stale, update } }).verify(token.raw, token.prefix);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not fail a request when recording its last use fails", async () => {
    const token = generateSessionToken();
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        storedSession({ tokenHash: token.hash, lastUsedAt: new Date(Date.now() - 120_000) }),
      );
    const update = jest.fn().mockRejectedValue(new Error("database is away"));

    await expect(
      serviceWith({ session: { findUnique, update } }).verify(token.raw, token.prefix),
    ).resolves.toMatchObject({ id: USER.id });
  });
});

describe("SessionService.revoke", () => {
  it("is idempotent, so signing out twice is not an error", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });

    await expect(serviceWith({ session: { deleteMany } }).revoke("gone")).resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "gone" } });
  });
});
