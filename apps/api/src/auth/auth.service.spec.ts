import { InvitationService, RedeemableInvitation } from "../organizations/invitation.service";
import { appConfig } from "../config/app-config";
import { PrismaService } from "../database/prisma.service";
import { DEFAULT_ORGANIZATION_ID } from "../organizations/default-organization";
import { AuthService } from "./auth.service";
import { GitHubIdentity } from "./github-identity";
import { SignInRefusedError } from "./sign-in-refusal";

// The allowlist is read from the environment once, at module load, so the config
// is stubbed rather than the process environment rewritten mid-suite. Hoisted
// above the import by Jest, so `appConfig` above is this object.
jest.mock("../config/app-config", () => ({
  appConfig: { githubAllowedLogins: [] as string[] },
}));

/** The stub is mutable; the real config is deliberately not. */
function allow(...logins: string[]): void {
  (appConfig as { githubAllowedLogins: string[] }).githubAllowedLogins = logins;
}

const IDENTITY: GitHubIdentity = {
  githubUserId: "583231",
  githubLogin: "octocat",
  name: "The Octocat",
  email: "octocat@example.com",
  avatarUrl: "https://avatars.example/u/583231",
};

const STORED = {
  id: "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e",
  email: IDENTITY.email,
  name: IDENTITY.name,
  githubLogin: IDENTITY.githubLogin,
  avatarUrl: IDENTITY.avatarUrl,
};

interface DatabaseStub {
  user: {
    findUnique?: jest.Mock;
    findFirst?: jest.Mock;
    update?: jest.Mock;
    create?: jest.Mock;
  };
  /** Only the claim path uses a transaction, and only to take the advisory lock. */
  $transaction?: jest.Mock;
}

function serviceWith(
  database: DatabaseStub,
  invitations: Partial<InvitationService> = {},
): AuthService {
  return new AuthService(
    database as unknown as PrismaService,
    invitations as unknown as InvitationService,
  );
}

/** A transaction client whose `user.findFirst` decides whether the instance is claimed. */
function transactionOver(database: DatabaseStub): jest.Mock {
  return jest.fn(async (run: (transaction: unknown) => Promise<unknown>) =>
    run({ ...database, $executeRaw: jest.fn() }),
  );
}

beforeEach(() => {
  allow();
});

describe("the allowlist", () => {
  it("admits everybody when it is unset", () => {
    expect(serviceWith({ user: {} }).isAllowedToSignIn("anyone")).toBe(true);
  });

  it("admits a listed login regardless of case", () => {
    allow("octocat");

    expect(serviceWith({ user: {} }).isAllowedToSignIn("Octocat")).toBe(true);
  });

  it("refuses an unlisted login before touching the database", async () => {
    allow("octocat");
    const findUnique = jest.fn();

    await expect(
      serviceWith({ user: { findUnique } }).signInWithGitHub(
        { ...IDENTITY, githubLogin: "intruder" },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "not_allowed" });

    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("an account that already exists", () => {
  it("is matched on the GitHub id, not the login", async () => {
    const findUnique = jest.fn().mockResolvedValue(STORED);

    const { viewer } = await serviceWith({ user: { findUnique } }).signInWithGitHub(
      IDENTITY,
      undefined,
    );

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { githubUserId: "583231" } }),
    );
    expect(viewer.id).toBe(STORED.id);
  });

  it("records a renamed login, so invitations keep matching", async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...STORED, githubLogin: "old-handle" });
    const update = jest.fn().mockResolvedValue(STORED);

    await serviceWith({ user: { findUnique, update } }).signInWithGitHub(IDENTITY, undefined);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ githubLogin: "octocat" }) }),
    );
  });

  it("does not write when nothing about the profile changed", async () => {
    const findUnique = jest.fn().mockResolvedValue(STORED);
    const update = jest.fn();

    await serviceWith({ user: { findUnique, update } }).signInWithGitHub(IDENTITY, undefined);

    expect(update).not.toHaveBeenCalled();
  });
});

describe("an account from before GitHub sign-in", () => {
  it("is adopted when its address matches the verified one", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const findFirst = jest.fn().mockResolvedValue({ id: STORED.id });
    const update = jest.fn().mockResolvedValue(STORED);

    const { viewer } = await serviceWith({
      user: { findUnique, findFirst, update },
    }).signInWithGitHub(IDENTITY, undefined);

    // Only an unlinked row is adoptable, which is what keeps this to one
    // adoption per account.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: IDENTITY.email, githubUserId: null } }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ githubUserId: "583231" }) }),
    );
    expect(viewer.id).toBe(STORED.id);
  });
});

describe("an instance with no accounts", () => {
  it("is claimed by the first arrival, as owner of the default organization", async () => {
    const create = jest.fn().mockResolvedValue(STORED);
    const database: DatabaseStub = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    database.$transaction = transactionOver(database);

    const { viewer } = await serviceWith(database).signInWithGitHub(IDENTITY, undefined);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          githubUserId: "583231",
          memberships: {
            create: { organizationId: DEFAULT_ORGANIZATION_ID, role: "OWNER" },
          },
        }),
      }),
    );
    expect(viewer.githubLogin).toBe("octocat");
  });
});

describe("an instance that has been claimed", () => {
  function claimedDatabase(): DatabaseStub {
    const database: DatabaseStub = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        // Null for the adoption probe, then a row for the claim check, so the
        // instance reads as claimed by somebody else.
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: "somebody-else" }),
        create: jest.fn(),
      },
    };
    database.$transaction = transactionOver(database);
    return database;
  }

  it("refuses a stranger holding no invitation", async () => {
    const database = claimedDatabase();

    await expect(serviceWith(database).signInWithGitHub(IDENTITY, undefined)).rejects.toMatchObject(
      { code: "no_account" },
    );
    expect(database.user.create).not.toHaveBeenCalled();
  });

  it("creates the account behind a valid invitation and spends it", async () => {
    const database = claimedDatabase();
    database.user.create = jest.fn().mockResolvedValue(STORED);

    const invitation: RedeemableInvitation = {
      id: "invitation",
      organizationId: "organization",
      organizationSlug: "acme",
      githubLogin: "octocat",
      role: "MEMBER",
    };
    const findRedeemable = jest.fn().mockResolvedValue(invitation);
    const redeem = jest.fn().mockResolvedValue({ organizationSlug: "acme" });

    const result = await serviceWith(database, { findRedeemable, redeem }).signInWithGitHub(
      IDENTITY,
      "dsi_token",
    );

    expect(result.organizationSlug).toBe("acme");
    expect(redeem).toHaveBeenCalledWith(invitation, STORED.id);
  });

  it("checks the invitation before creating anything", async () => {
    // Otherwise a bad link would leave a stranded account behind on an instance
    // that admits nobody without one.
    const database = claimedDatabase();
    const findRedeemable = jest
      .fn()
      .mockRejectedValue(new SignInRefusedError("invitation_mismatch", "for somebody else"));

    await expect(
      serviceWith(database, { findRedeemable }).signInWithGitHub(IDENTITY, "dsi_token"),
    ).rejects.toMatchObject({ code: "invitation_mismatch" });

    expect(database.user.create).not.toHaveBeenCalled();
  });
});
