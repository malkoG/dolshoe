import { GitHubIdentity } from "./github-identity";

/**
 * The address a mock account is created with.
 *
 * @remarks
 * `.invalid` is reserved by RFC 2606 and can never be a real domain, which
 * matters more than it looks: `AuthService` links a GitHub account to an
 * account that predates GitHub sign-in by matching addresses, so an identity
 * anybody can conjure by typing a login must never be able to name an address a
 * real account might hold.
 */
const MOCK_EMAIL_DOMAIN = "mock.invalid";

/** Prefixes the fabricated GitHub id, so it cannot collide with a real one. */
const MOCK_USER_ID_PREFIX = "mock-";

/**
 * `User.githubUserId` is `VarChar(32)` and the id is the prefix plus the login,
 * so the login has to leave room for the prefix. Well short of GitHub's own
 * 39-character limit, which is fine: nothing here has to accept every login that
 * exists, only enough of them to develop against.
 */
export const MAXIMUM_MOCK_LOGIN_LENGTH = 32 - MOCK_USER_ID_PREFIX.length;

/**
 * GitHub's own rule for a login: alphanumerics and single inner hyphens. Applied
 * so a mock account looks like the thing it stands in for — and so a login
 * cannot carry whitespace or an `@` into an address.
 */
export const MOCK_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d]))*$/;

/**
 * Fabricates the identity that GitHub would otherwise have vouched for.
 *
 * @remarks
 * This is the whole of the pretending. Everything downstream — the allowlist,
 * the instance claim, invitation redemption — is the same code a real sign-in
 * runs, so a development instance refuses the same sign-ins a deployed one
 * would.
 *
 * The id is derived from the login rather than random so that signing in as the
 * same login twice reaches the same account, across restarts as well as within
 * one. That is what makes a mock login a persona rather than a new stranger
 * every time.
 */
export function mockIdentity(login: string): GitHubIdentity {
  return {
    githubUserId: `${MOCK_USER_ID_PREFIX}${login}`,
    githubLogin: login,
    name: login,
    email: `${login}@${MOCK_EMAIL_DOMAIN}`,
    avatarUrl: undefined,
  };
}
