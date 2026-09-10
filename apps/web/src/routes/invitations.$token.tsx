import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { MockSignIn } from "../components/mock-sign-in";
import { ApiError, describeError } from "../lib/api-request";
import { acceptInvitation } from "../lib/organizations";
import { githubSignInUrl } from "../lib/session";
import {
  INVALID_INVITATION_MESSAGE,
  invitationAccountLabel,
  InvitationView,
  MISMATCHED_INVITATION_MESSAGE,
} from "../screens/invitation/invitation-view";

export const Route = createFileRoute("/invitations/$token")({ component: AcceptInvitation });

/**
 * The two refusals this page can do something about, said in words that name
 * the fix. Anything else falls through to the message the call already carries.
 */
function describeAcceptFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return INVALID_INVITATION_MESSAGE;
    if (error.status === 403) return MISMATCHED_INVITATION_MESSAGE;
  }
  return describeError(error, "Something went wrong while accepting the invitation.");
}

function AcceptInvitation() {
  const router = useRouter();
  const { token } = Route.useParams();
  const { viewer, mockLoginAvailable } = Route.useRouteContext().session;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
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
      setError(describeAcceptFailure(cause));
      setSubmitting(false);
    }
  }

  // Signed out there is no account to add yet, and only GitHub can say who is
  // holding this link. Redeeming it is therefore part of signing in rather
  // than a step after it, which is also what keeps a forwarded link from
  // adding whoever opened it. Mock sign-in carries the same token so a local
  // walk-through redeems in one step, the way a GitHub sign-in does.
  return (
    <InvitationView
      accountLabel={viewer == null ? undefined : invitationAccountLabel(viewer)}
      error={error}
      githubHref={githubSignInUrl({ invitation: token })}
      mockSignIn={mockLoginAvailable ? <MockSignIn invitation={token} /> : undefined}
      onAccept={(event) => void submit(event)}
      submitting={submitting}
    />
  );
}
