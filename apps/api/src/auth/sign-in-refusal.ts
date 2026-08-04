/**
 * Why a GitHub sign-in was refused, in terms the sign-in page can explain.
 *
 * @remarks
 * A code rather than a message, because the browser is redirected back to the
 * web app rather than shown an API response: the wording belongs to the page,
 * and passing prose through a query string would put a server string on screen
 * where the app cannot translate or style it.
 *
 * Every value here is safe to reflect to somebody who is not signed in, which is
 * why none of them distinguishes "no such account" from "not invited".
 */
export const SIGN_IN_REFUSAL_CODES = [
  /** GitHub sign-in is not configured on this instance. */
  "not_configured",
  /** The `state` cookie was missing, stale, or did not match what came back. */
  "state",
  /** The person declined at GitHub's authorization screen. */
  "denied",
  /** GitHub could not be reached, or answered with something unusable. */
  "github_unavailable",
  /** The account's login is not on this instance's allowlist. */
  "not_allowed",
  /** No account here, and nothing that would create one. */
  "no_account",
  /** The invitation link is unknown, spent, revoked, or expired. */
  "invitation_invalid",
  /** The invitation names a different GitHub account. */
  "invitation_mismatch",
  /** Another account already holds this GitHub account's address. */
  "account_conflict",
] as const;

export type SignInRefusalCode = (typeof SIGN_IN_REFUSAL_CODES)[number];

/**
 * A sign-in that failed for a reason the person can act on, as opposed to one
 * that failed because something broke.
 *
 * @remarks
 * Carries the code rather than an HTTP status because two refusals that both map
 * to 403 — an allowlist miss and a mismatched invitation — need different things
 * done about them, and a status would collapse the two.
 */
export class SignInRefusedError extends Error {
  constructor(
    readonly code: SignInRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "SignInRefusedError";
  }
}
