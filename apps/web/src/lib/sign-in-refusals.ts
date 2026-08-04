/**
 * Why a sign-in did not finish, as the API reports it. Mirrors
 * `SignInRefusalCode` on the server; an unrecognized value falls through to the
 * generic wording rather than showing a raw code.
 *
 * Shared rather than colocated with the sign-in page because the mock sign-in
 * hits the same refusals — the allowlist, a missing account, a spent invitation —
 * and two copies of this wording would drift.
 */
const REFUSALS: Record<string, string> = {
  not_configured:
    "This instance has no GitHub OAuth app configured, so nobody can sign in yet. An operator needs to set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL.",
  state: "That sign-in took too long or was started somewhere else. Try again.",
  denied: "You declined the request at GitHub. Nothing was changed.",
  github_unavailable: "GitHub could not be reached to finish signing in. Try again in a moment.",
  not_allowed:
    "That GitHub account is not on this instance's allowlist. Ask an operator to add it.",
  no_account:
    "That GitHub account has no access to this instance. Ask an owner or admin for an invitation.",
  invitation_invalid: "That invitation link is not valid, or it has expired. Ask for a new one.",
  invitation_mismatch:
    "That invitation was issued for a different GitHub account. Sign in as that account to accept it.",
  account_conflict:
    "Another account on this instance already uses that address. An owner has to reconcile the two.",
};

export function describeRefusal(code: string): string {
  return REFUSALS[code] ?? REFUSALS.state;
}
