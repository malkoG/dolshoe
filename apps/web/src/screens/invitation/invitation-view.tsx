import { Alert, AlertDescription } from "@dolshoe/ui/components/ui/alert";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import type { FormEvent, ReactNode } from "react";

import { AuthCard } from "./auth-card";

export const INVITATION_TITLE = "Join the organization";

export const SIGNED_OUT_BODY =
  "This invitation was issued for a GitHub account. Sign in with it to accept — the link only works for the account it names.";

export const SIGNED_OUT_NOTE =
  "Dolshoe reads your GitHub profile and verified email address. It asks for no access to your repositories.";

export const SIGNED_IN_NOTE =
  '404 → "That invitation link is not valid, or it has expired."  ·  403 → "That invitation was issued for a different GitHub account. Sign in as that account first."';

export const INVALID_INVITATION_MESSAGE = "That invitation link is not valid, or it has expired.";

export const MISMATCHED_INVITATION_MESSAGE =
  "That invitation was issued for a different GitHub account. Sign in as that account first.";

/**
 * Who is holding the link, in the words the card uses.
 *
 * @remarks
 * A GitHub login is what the invitation named. An email is the fallback
 * for an account that predates GitHub sign-in and has not been adopted.
 */
export function invitationAccountLabel(viewer: {
  email: string;
  githubLogin: string | null;
}): string {
  return viewer.githubLogin == null ? viewer.email : `@${viewer.githubLogin}`;
}

/**
 * The invitation page as a function of named state.
 *
 * @remarks
 * The route is the composition root: it knows the token, the session, and
 * the accept call. This view only paints what it is given. `accountLabel`
 * absent means signed out; present means the visitor already has an
 * account and can spend the link from here.
 */
export interface InvitationViewProps {
  accountLabel?: string;
  error?: string;
  githubHref: string;
  mockSignIn?: ReactNode;
  onAccept?: (event: FormEvent<HTMLFormElement>) => void;
  submitting?: boolean;
}

export function InvitationView({
  accountLabel,
  error,
  githubHref,
  mockSignIn,
  onAccept,
  submitting = false,
}: InvitationViewProps) {
  const signedIn = accountLabel != null;

  return (
    <AuthCard
      title={INVITATION_TITLE}
      body={
        signedIn ? (
          <>
            You are signed in as{" "}
            <strong className="font-semibold text-foreground">{accountLabel}</strong>. Accepting
            adds this organization to your account.
          </>
        ) : (
          SIGNED_OUT_BODY
        )
      }
      note={signedIn ? SIGNED_IN_NOTE : SIGNED_OUT_NOTE}
    >
      {error != null && (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {signedIn ? (
        <form onSubmit={onAccept}>
          <Button className="w-full" disabled={submitting} size="lg" type="submit">
            {submitting && <Spinner />}
            Accept invitation
          </Button>
        </form>
      ) : (
        <Button asChild className="w-full" size="lg">
          <a href={githubHref}>Continue with GitHub</a>
        </Button>
      )}

      {mockSignIn}
    </AuthCard>
  );
}
