import { Alert, AlertDescription } from "@dolshoe/ui/components/ui/alert";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { useState } from "react";

import { AuthCard } from "../components/auth-card";
import { MockSignIn } from "../components/mock-sign-in";
import { ApiError, describeError } from "../lib/api-request";
import { acceptInvitation } from "../lib/organizations";
import { githubSignInUrl } from "../lib/session";

export const Route = createFileRoute("/invitations/$token")({ component: AcceptInvitation });

/**
 * The two refusals this page can do something about, said in words that name
 * the fix. Anything else falls through to the message the call already carries.
 */
function describeAcceptFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "That invitation link is not valid, or it has expired.";
    if (error.status === 403) {
      return "That invitation was issued for a different GitHub account. Sign in as that account first.";
    }
  }
  return describeError(error, "Something went wrong while accepting the invitation.");
}

function AcceptInvitation() {
  const router = useRouter();
  const { token } = Route.useParams();
  const { viewer, mockLoginAvailable } = Route.useRouteContext().session;
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
      setError(describeAcceptFailure(cause));
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Join the organization">
      {viewer == null ? (
        // Signed out there is no account to add yet, and only GitHub can say
        // who is holding this link. Redeeming it is therefore part of signing
        // in rather than a step after it, which is also what keeps a forwarded
        // link from adding whoever opened it.
        <>
          <p className="text-[13px] text-muted-foreground">
            This invitation was issued for a GitHub account. Sign in with it to accept — the link
            only works for the account it names.
          </p>

          <Button asChild size="lg">
            <a href={githubSignInUrl({ invitation: token })}>
              <Github />
              Continue with GitHub
            </a>
          </Button>

          {/*
            Carries the link's token, so a mock sign-in redeems the invitation
            in the same single step a GitHub one does. Which makes the whole
            invite-and-accept flow something you can walk through locally
            without two GitHub accounts.
          */}
          {mockLoginAvailable && <MockSignIn invitation={token} />}
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <p className="text-[13px] text-muted-foreground">
            You are signed in as{" "}
            <strong className="font-bold text-foreground">
              {viewer.githubLogin == null ? viewer.email : `@${viewer.githubLogin}`}
            </strong>
            . Accepting adds this organization to your account.
          </p>

          {error != null && (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button disabled={submitting} size="lg" type="submit">
            {submitting && <Spinner />}
            Accept invitation
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
