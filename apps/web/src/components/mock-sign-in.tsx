import { Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { SignInRefused, mockSignIn } from "../lib/session";
import { describeRefusal } from "../lib/sign-in-refusals";

/**
 * The API accepts a login of at most this length, so that the GitHub id it
 * fabricates fits the column that stores it. Mirrored here the way every other
 * contract in this app is, to stop a too-long login at the keyboard rather than
 * at a 400.
 */
const MAXIMUM_LOGIN_LENGTH = 27;

function describe(error: unknown): string {
  if (error instanceof SignInRefused) return describeRefusal(error.code);
  if (error instanceof Error) return error.message;
  return "Something went wrong while signing in.";
}

/**
 * Signing in as anybody, on an instance running with `MOCK_LOGIN`.
 *
 * @remarks
 * Shown only when the API says the door is open, which it never is in
 * production. Deliberately styled as an aside rather than as the page's action:
 * it is scaffolding, and it should look like scaffolding even to somebody who
 * meets it before they have read why it exists.
 *
 * Everything past the login is the real sign-in path, so this refuses exactly
 * what a GitHub sign-in would — an account with no invitation, a login off the
 * allowlist — and says so in the same words.
 */
export function MockSignIn({
  invitation,
  redirect,
}: {
  invitation?: string;
  redirect?: string;
}): React.JSX.Element {
  const [login, setLogin] = useState("dev");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(undefined);
    try {
      const { organizationSlug } = await mockSignIn({ login, invitation });

      // A full navigation rather than a router one, for the same reason the
      // GitHub callback lands as a navigation: the root load has to run again to
      // pick up the session this just established. An invitation decides where
      // that lands, exactly as it does in `auth.controller.ts`.
      window.location.assign(
        organizationSlug == null ? (redirect ?? "/") : `/orgs/${organizationSlug}/projects`,
      );
    } catch (cause) {
      setError(describe(cause));
      setSubmitting(false);
    }
  }

  return (
    <form className="mock-login" onSubmit={(event) => void submit(event)}>
      <p className="mock-login-heading">
        <TriangleAlert size={13} />
        Development sign-in
      </p>

      <p className="auth-note">
        This instance runs with <code>MOCK_LOGIN</code>. Whatever login you type is who you become —
        GitHub is not asked, and nothing is verified.
      </p>

      {error != null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <label className="auth-field" htmlFor="mock-login">
        GitHub login
        <input
          id="mock-login"
          name="login"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAXIMUM_LOGIN_LENGTH}
          required
        />
      </label>

      <button
        className="primary-button"
        disabled={submitting || login.trim().length === 0}
        type="submit"
      >
        {submitting && <Loader2 className="spin" size={14} />}
        Sign in as this account
      </button>
    </form>
  );
}
