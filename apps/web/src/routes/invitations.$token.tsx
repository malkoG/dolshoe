import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api-request";
import { acceptInvitation } from "../lib/organizations";

export const Route = createFileRoute("/invitations/$token")({ component: AcceptInvitation });

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "That invitation link is not valid, or it has expired.";
    if (error.status === 403) {
      return "That invitation was issued for a different address. Sign in as that account first.";
    }
    if (error.status === 409) {
      return "An account already exists for that address. Sign in first, then open the link again.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong while accepting the invitation.";
}

function AcceptInvitation() {
  const router = useRouter();
  const { token } = Route.useParams();
  const { viewer } = Route.useRouteContext().session;
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(undefined);
    try {
      // Signed in, the link only needs to grant the membership. Signed out, it
      // also creates the account, so the form above collects what that needs.
      const accepted = await acceptInvitation(
        viewer == null ? { token, name: name.trim(), password } : { token },
      );
      await router.invalidate();
      await router.navigate({
        to: "/orgs/$orgSlug/projects",
        params: { orgSlug: accepted.organizationSlug },
      });
    } catch (cause) {
      setError(describeError(cause));
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={(event) => void submit(event)}>
        <img className="auth-mark" src="/dolshoe-mark.svg" alt="" />
        <h1>Join the organization</h1>

        {viewer == null ? (
          <>
            <p className="auth-note">
              Create your account to accept this invitation. It is tied to the address it was sent
              to.
            </p>

            <label className="auth-field">
              <span>Name</span>
              <input
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                required
                type="text"
                value={name}
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                autoComplete="new-password"
                minLength={12}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <span className="auth-hint">At least 12 characters.</span>
            </label>
          </>
        ) : (
          <p className="auth-note">
            You are signed in as <strong>{viewer.email}</strong>. Accepting adds this organization
            to your account.
          </p>
        )}

        {error != null && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting && <Loader2 className="spin" size={14} />}
          Accept invitation
        </button>
      </form>
    </main>
  );
}
