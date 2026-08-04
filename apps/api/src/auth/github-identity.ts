import { z } from "zod";

/**
 * Who GitHub says the caller is, reduced to what Dolshoe stores.
 *
 * @remarks
 * `githubUserId` is the identity; the login is display data that its owner can
 * change, and that GitHub will happily reissue to somebody else once released.
 * Anything that has to survive a rename matches on the id.
 */
export interface GitHubIdentity {
  readonly githubUserId: string;
  /** Lowercased, because GitHub treats logins case-insensitively. */
  readonly githubLogin: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string | undefined;
}

/**
 * GitHub's own responses are external input and are validated like any other.
 * Only the fields Dolshoe reads are described; GitHub sends many more, and
 * failing on an unexpected addition would make an upstream change an outage.
 */
export const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1).max(39),
  name: z.string().min(1).max(200).nullish(),
  email: z.string().min(1).max(320).nullish(),
  avatar_url: z.string().url().max(500).nullish(),
});

export const githubEmailListSchema = z.array(
  z.object({
    email: z.string().min(1).max(320),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);

export const githubAccessTokenSchema = z.union([
  z.object({ access_token: z.string().min(1) }),
  // GitHub answers 200 with an error body rather than a 4xx, so the failure
  // has to be read out of the payload instead of the status.
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

export type GitHubUser = z.infer<typeof githubUserSchema>;
export type GitHubEmail = z.infer<typeof githubEmailListSchema>[number];

/**
 * The address GitHub hands out when a user keeps theirs private. Stable, unique
 * per account, and never deliverable — which is fine, because Dolshoe sends no
 * mail and does not authenticate on the address.
 */
export function noReplyAddressFor(user: GitHubUser): string {
  return `${user.id}+${user.login.toLowerCase()}@users.noreply.github.com`;
}

/**
 * Picks the address to record for an account.
 *
 * @remarks
 * Only a verified address is accepted. An unverified one is a claim the user
 * made about themselves, and Dolshoe adopts a pre-GitHub account by matching
 * this value — so trusting an unverified address would let anybody take over an
 * account by typing its owner's address into GitHub.
 *
 * The public profile address is used only when it also appears verified in the
 * account's address list, for the same reason.
 */
export function selectVerifiedEmail(user: GitHubUser, addresses: GitHubEmail[]): string {
  const verified = addresses.filter((address) => address.verified);

  return (
    verified.find((address) => address.primary)?.email ??
    verified.find((address) => address.email === user.email)?.email ??
    verified[0]?.email ??
    noReplyAddressFor(user)
  );
}

export function toGitHubIdentity(user: GitHubUser, addresses: GitHubEmail[]): GitHubIdentity {
  return {
    githubUserId: String(user.id),
    githubLogin: user.login.toLowerCase(),
    // A GitHub profile name is optional, and Dolshoe needs something to show.
    name: user.name ?? user.login,
    email: selectVerifiedEmail(user, addresses),
    avatarUrl: user.avatar_url ?? undefined,
  };
}
