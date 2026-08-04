import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Github, Loader2 } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api-request";
import { acceptInvitation } from "../lib/organizations";
import { githubSignInUrl } from "../lib/session";

export const Route = createFileRoute("/invitations/$token")({ component: AcceptInvitation });

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "That invitation link is not valid, or it has expired.";
    if (error.status === 403) {
      return "That invitation was issued for a different GitHub account. Sign in as that account first.";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(undefined);
    try {
      const accepted = await acceptInvitation({ token });
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
      <div className="auth-panel">
        <img className="auth-mark" src="/dolshoe-mark.svg" alt="" />
        <h1>Join the organization</h1>

        {viewer == null ? (
          // Signed out there is no account to add yet, and only GitHub can say
          // who is holding this link. Redeeming it is therefore part of signing
          // in rather than a step after it, which is also what keeps a forwarded
          // link from adding whoever opened it.
          <>
            <p className="auth-note">
              This invitation was issued for a GitHub account. Sign in with it to accept — the link
              only works for the account it names.
            </p>

            <a className="github-button" href={githubSignInUrl({ invitation: token })}>
              <Github size={16} />
              Continue with GitHub
            </a>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <p className="auth-note">
              You are signed in as{" "}
              <strong>
                {viewer.githubLogin == null ? viewer.email : `@${viewer.githubLogin}`}
              </strong>
              . Accepting adds this organization to your account.
            </p>

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
        )}
      </div>
    </main>
  );
}
