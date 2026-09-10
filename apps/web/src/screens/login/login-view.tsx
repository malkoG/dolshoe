import { Alert, AlertDescription } from "@dolshoe/ui/components/ui/alert";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Card } from "@dolshoe/ui/components/ui/card";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { TriangleAlert } from "lucide-react";

export { LOGIN_PRIVACY_NOTE, LOGIN_TITLE, LOGIN_UNCLAIMED_BODY } from "./login-copy";

/**
 * The API accepts a login of at most this length, so that the GitHub id it
 * fabricates fits the column that stores it. Mirrored here the way the shared
 * mock-sign-in form mirrors it — a private copy, so invitations keep their own.
 */
const MAXIMUM_LOGIN_LENGTH = 27;

export interface LoginMockSignInProps {
  login: string;
  submitting: boolean;
  error?: string;
  onLoginChange: (login: string) => void;
  onSubmit: () => void;
}

export interface LoginViewProps {
  title: string;
  body?: string;
  note?: string;
  githubSignInHref?: string;
  refusal?: string;
  unconfigured?: boolean;
  mockSignIn?: LoginMockSignInProps;
}

/**
 * The signed-out login page as a public view.
 *
 * @remarks
 * Receives the words and the doors; it does not know about session cookies
 * or `fetch`. The `/login` route is the composition root. A construction
 * test and a silhouette are the other one: they inject a named state.
 *
 * AuthCard and the development form live here as private copies so the
 * shared signed-out chrome used by invitation redemption stays untouched.
 */
export function LoginView({
  title,
  body,
  note,
  githubSignInHref,
  refusal,
  unconfigured = false,
  mockSignIn,
}: LoginViewProps) {
  return (
    <main className="grid min-h-screen place-content-center bg-background px-5 py-12">
      <div className="flex w-full max-w-md flex-col gap-3 sm:min-w-md">
        {refusal != null && (
          <Alert
            className="border-brand bg-brand-soft text-brand"
            role="alert"
            variant="destructive"
          >
            <AlertDescription className="text-brand">{refusal}</AlertDescription>
          </Alert>
        )}

        {unconfigured && (
          <Alert role="alert">
            <AlertDescription>
              GitHub sign-in is not configured on this instance, so there is no way in yet. An
              operator needs to set <code className="font-mono">GITHUB_CLIENT_ID</code>,{" "}
              <code className="font-mono">GITHUB_CLIENT_SECRET</code>, and{" "}
              <code className="font-mono">GITHUB_CALLBACK_URL</code>.
            </AlertDescription>
          </Alert>
        )}

        <AuthCard body={body} githubSignInHref={githubSignInHref} note={note} title={title} />

        {mockSignIn != null && <MockSignInForm {...mockSignIn} />}
      </div>
    </main>
  );
}

function AuthCard({
  title,
  body,
  note,
  githubSignInHref,
}: Readonly<{
  title: string;
  body?: string;
  note?: string;
  githubSignInHref?: string;
}>) {
  return (
    <Card className="w-full gap-5 rounded-2xl p-8 shadow-panel">
      <img alt="" className="size-9" src="/dolshoe-mark.svg" />
      <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.04em] text-balance">
        {title}
      </h1>
      {body != null && <p className="text-sm text-muted-foreground">{body}</p>}
      {githubSignInHref != null && (
        <Button asChild className="w-full" size="lg">
          <a href={githubSignInHref}>Continue with GitHub</a>
        </Button>
      )}
      {note != null && <p className="text-xs font-medium text-faint">{note}</p>}
    </Card>
  );
}

function MockSignInForm({
  login,
  submitting,
  error,
  onLoginChange,
  onSubmit,
}: LoginMockSignInProps) {
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-dashed border-input bg-muted p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="flex items-center gap-1 font-mono text-badge font-medium tracking-[0.08em] text-warning uppercase">
        <TriangleAlert aria-hidden="true" className="size-3.5" />
        Development sign-in
      </p>

      <p className="text-xs font-medium text-muted-foreground">
        This instance runs with <code className="font-mono">MOCK_LOGIN</code>. Whatever login you
        type is who you become — GitHub is not asked, and nothing is verified.
      </p>

      {error != null && (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold" htmlFor="mock-login">
          GitHub login
        </Label>
        <Input
          autoCapitalize="off"
          autoComplete="off"
          id="mock-login"
          maxLength={MAXIMUM_LOGIN_LENGTH}
          name="login"
          onChange={(event) => onLoginChange(event.target.value)}
          required
          spellCheck={false}
          value={login}
        />
      </div>

      <Button className="w-full" disabled={submitting || login.trim().length === 0} type="submit">
        {submitting && <Spinner />}
        Sign in as this account
      </Button>
    </form>
  );
}
