import { Alert, AlertDescription } from "@dolshoe/ui/components/ui/alert";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { TriangleAlert } from "lucide-react";
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
    // Dashed rather than solid, so it reads as scaffolding bolted onto the page
    // rather than as part of it.
    <form
      className="flex flex-col gap-3 rounded-xl border border-dashed border-input bg-muted p-5"
      onSubmit={(event) => void submit(event)}
    >
      <p className="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.08em] text-warning uppercase">
        <TriangleAlert className="size-3.5" />
        Development sign-in
      </p>

      <p className="text-[13px] text-muted-foreground">
        This instance runs with <code className="font-mono">MOCK_LOGIN</code>. Whatever login you
        type is who you become — GitHub is not asked, and nothing is verified.
      </p>

      {error != null && (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mock-login">GitHub login</Label>
        <Input
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
      </div>

      <Button disabled={submitting || login.trim().length === 0} type="submit">
        {submitting && <Spinner />}
        Sign in as this account
      </Button>
    </form>
  );
}
