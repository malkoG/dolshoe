import { Injectable } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { PrismaService } from "../database/prisma.service";
import { MembershipRole, Prisma } from "../generated/prisma/client";
import { DEFAULT_ORGANIZATION_ID } from "../organizations/default-organization";
import { InvitationService, RedeemableInvitation } from "../organizations/invitation.service";
import { appConfig } from "../config/app-config";
import { Viewer } from "./auth.contract";
import { GitHubIdentity } from "./github-identity";
import { SignInRefusedError } from "./sign-in-refusal";

/**
 * Serializes instance claims. Two sign-ins arriving together would otherwise
 * both observe an unclaimed instance and both succeed, leaving an instance with
 * an owner nobody intended.
 */
const INSTANCE_CLAIM_LOCK = "dolshoe.instance-claim";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

const logger = getLogger(["dolshoe", "auth"]);

interface UserRow {
  id: string;
  email: string;
  name: string;
  githubLogin: string | null;
  avatarUrl: string | null;
}

const userColumns = {
  id: true,
  email: true,
  name: true,
  githubLogin: true,
  avatarUrl: true,
} as const;

function toViewer(row: UserRow): Viewer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    githubLogin: row.githubLogin,
    avatarUrl: row.avatarUrl,
  };
}

function violatedFields(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return [];
  if (error.code !== UNIQUE_CONSTRAINT_VIOLATION) return [];

  const target = error.meta?.target;
  if (Array.isArray(target))
    return target.filter((field): field is string => typeof field === "string");
  return typeof target === "string" ? [target] : [];
}

/**
 * Turns a GitHub account into a Dolshoe account.
 *
 * @remarks
 * There is exactly one way in. Which means this service answers a question no
 * password ever had to: somebody has proved who they are at GitHub, and the
 * instance still has to decide whether that person belongs here at all. Four
 * things can make them belong, checked in this order:
 *
 * 1. They already have an account, matched on GitHub's immutable user id.
 * 2. There is an account from before GitHub sign-in existed whose address
 *    matches theirs, which they adopt.
 * 3. The instance has no accounts, so the first arrival claims it.
 * 4. They arrived holding an invitation issued for their login.
 *
 * Nothing else creates an account. An instance that has been claimed does not
 * quietly grow accounts because strangers found its sign-in page.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly database: PrismaService,
    private readonly invitationService: InvitationService,
  ) {}

  async isInstanceClaimed(): Promise<boolean> {
    const existing = await this.database.user.findFirst({ select: { id: true } });
    return existing != null;
  }

  /**
   * Whether a login may hold an account here at all.
   *
   * @remarks
   * An empty allowlist means no restriction rather than "nobody", because the
   * variable being unset is the ordinary case for an instance that gates access
   * through invitations alone. This is a separate axis from membership: passing
   * it earns an account, not a place in any organization.
   */
  isAllowedToSignIn(githubLogin: string): boolean {
    const allowed = appConfig.githubAllowedLogins;
    return allowed.length === 0 || allowed.includes(githubLogin.toLowerCase());
  }

  /**
   * Signs a GitHub account in, creating or adopting the Dolshoe account behind
   * it when something entitles them to one.
   *
   * @param invitationToken - The link the flow started from, when it started
   * from one. Validated before any account is created, so a bad link cannot
   * leave a stranded account behind.
   *
   * @returns The viewer, and the organization an invitation put them in when one
   * did — which is where the browser should land.
   */
  async signInWithGitHub(
    identity: GitHubIdentity,
    invitationToken: string | undefined,
  ): Promise<{ viewer: Viewer; organizationSlug: string | undefined }> {
    if (!this.isAllowedToSignIn(identity.githubLogin)) {
      logger.warn("Refused sign-in by {githubLogin}: not on the allowlist.", {
        githubLogin: identity.githubLogin,
      });
      throw new SignInRefusedError(
        "not_allowed",
        `${identity.githubLogin} is not on this instance's allowlist.`,
      );
    }

    const invitation =
      invitationToken == null
        ? undefined
        : await this.invitationService.findRedeemable(invitationToken, identity.githubLogin);

    const account = await this.resolveAccount(identity, invitation);

    if (invitation == null) return { viewer: toViewer(account), organizationSlug: undefined };

    const { organizationSlug } = await this.invitationService.redeem(invitation, account.id);

    return { viewer: toViewer(account), organizationSlug };
  }

  private async resolveAccount(
    identity: GitHubIdentity,
    invitation: RedeemableInvitation | undefined,
  ): Promise<UserRow> {
    const linked = await this.database.user.findUnique({
      where: { githubUserId: identity.githubUserId },
      select: userColumns,
    });

    if (linked != null) return this.refresh(linked, identity);

    const adopted = await this.adoptPreGitHubAccount(identity);
    if (adopted != null) return adopted;

    // Only now, because claiming and being invited both create a row and the
    // checks above are what decide whether one is needed at all.
    const claimed = await this.claimUnclaimedInstance(identity);
    if (claimed != null) return claimed;

    if (invitation == null) {
      throw new SignInRefusedError(
        "no_account",
        `${identity.githubLogin} has no account on this instance and no invitation to one.`,
      );
    }

    return this.createInvitedAccount(identity);
  }

  /**
   * Keeps the stored login, name, and avatar current.
   *
   * @remarks
   * The login especially: it is what invitations are addressed to, so a stale
   * copy would make an invitation issued for somebody's current handle fail to
   * match the account that holds it.
   *
   * The address is deliberately not refreshed. It stopped being a credential
   * when passwords went, its only remaining jobs are display and one-time
   * adoption, and chasing GitHub's copy of it would trip the unique constraint
   * whenever two accounts converged on one address.
   */
  private async refresh(stored: UserRow, identity: GitHubIdentity): Promise<UserRow> {
    const unchanged =
      stored.githubLogin === identity.githubLogin &&
      stored.name === identity.name &&
      stored.avatarUrl === (identity.avatarUrl ?? null);

    if (unchanged) return stored;

    return this.database.user.update({
      where: { id: stored.id },
      data: {
        githubLogin: identity.githubLogin,
        name: identity.name,
        avatarUrl: identity.avatarUrl ?? null,
      },
      select: userColumns,
    });
  }

  /**
   * Links a GitHub account to an account that predates GitHub sign-in.
   *
   * @remarks
   * Matched on the address, which is only safe because
   * {@link selectVerifiedEmail} refuses to hand back an unverified one: an
   * address anybody could type into their GitHub profile would otherwise be a
   * way to walk into somebody else's account.
   *
   * `githubUserId: null` in the filter is what keeps this to one adoption. An
   * account that has already been linked is not offered up again.
   */
  private async adoptPreGitHubAccount(identity: GitHubIdentity): Promise<UserRow | undefined> {
    const adoptable = await this.database.user.findFirst({
      where: { email: identity.email, githubUserId: null },
      select: { id: true },
    });

    if (adoptable == null) return undefined;

    const adopted = await this.database.user.update({
      where: { id: adoptable.id },
      data: {
        githubUserId: identity.githubUserId,
        githubLogin: identity.githubLogin,
        name: identity.name,
        avatarUrl: identity.avatarUrl ?? null,
      },
      select: userColumns,
    });

    logger.info("{githubLogin} adopted the pre-GitHub account for {email}.", {
      githubLogin: identity.githubLogin,
      email: identity.email,
    });

    return adopted;
  }

  /**
   * Claims an instance that has no accounts.
   *
   * @remarks
   * A fresh instance has nobody to issue an invitation, and a migration cannot
   * invent a GitHub account, so the first person to sign in claims it; everyone
   * after that arrives by invitation. This is why an instance must be claimed as
   * soon as it is reachable, and why the API warns at startup while it is not —
   * and why an allowlist is worth setting before the instance is exposed.
   *
   * The account is made an owner of the default organization rather than of a
   * fresh one, because that is where every project an upgraded instance already
   * had was backfilled.
   */
  private async claimUnclaimedInstance(identity: GitHubIdentity): Promise<UserRow | undefined> {
    return this.database.$transaction(async (transaction) => {
      // Taken before the count so the check and the insert are one decision.
      // Released when the transaction ends, whichever way it ends.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${INSTANCE_CLAIM_LOCK}))`;

      const existing = await transaction.user.findFirst({ select: { id: true } });
      if (existing != null) return undefined;

      const created = await transaction.user.create({
        data: {
          ...this.accountData(identity),
          memberships: {
            create: { organizationId: DEFAULT_ORGANIZATION_ID, role: MembershipRole.OWNER },
          },
        },
        select: userColumns,
      });

      logger.info("Instance claimed by {githubLogin}.", { githubLogin: identity.githubLogin });

      return created;
    });
  }

  /**
   * Creates the account behind a valid invitation. The membership itself is the
   * invitation's to grant, so nothing here joins any organization.
   */
  private async createInvitedAccount(identity: GitHubIdentity): Promise<UserRow> {
    try {
      return await this.database.user.create({
        data: this.accountData(identity),
        select: userColumns,
      });
    } catch (error) {
      const fields = violatedFields(error);

      // Two tabs finishing the same sign-in at once. The row the other one wrote
      // is the answer, so this reads it rather than failing a legitimate attempt.
      if (fields.includes("githubUserId")) {
        const linked = await this.database.user.findUnique({
          where: { githubUserId: identity.githubUserId },
          select: userColumns,
        });
        if (linked != null) return linked;
      }

      if (fields.includes("email")) {
        // Not a race: a different GitHub account already holds this address, so
        // the two accounts have to be reconciled by hand.
        logger.error("{githubLogin} cannot be created: {email} belongs to another account.", {
          githubLogin: identity.githubLogin,
          email: identity.email,
        });
        throw new SignInRefusedError(
          "account_conflict",
          `Another account on this instance already uses ${identity.email}.`,
        );
      }

      throw error;
    }
  }

  private accountData(identity: GitHubIdentity) {
    return {
      email: identity.email,
      name: identity.name,
      githubUserId: identity.githubUserId,
      githubLogin: identity.githubLogin,
      avatarUrl: identity.avatarUrl ?? null,
    };
  }
}
