import { createFileRoute, redirect } from "@tanstack/react-router";
import { Github } from "lucide-react";

import { MockSignIn } from "../components/mock-sign-in";
import { githubSignInUrl } from "../lib/session";
import { describeRefusal } from "../lib/sign-in-refusals";

/**
 * Only a path on this site is accepted, so a crafted `?redirect=` cannot bounce
 * a freshly signed-in visitor to somewhere else entirely. `//evil.example` is
 * rejected too: a browser reads a protocol-relative URL as another origin.
 *
 * The API applies the same rule to what it stores in the state cookie. This copy
 * is not the defence — it only keeps a bad value from being put on screen as a
 * link.
 */
function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
    redirect: safeRedirect(search.redirect),
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.session.viewer != null) {
      throw redirect({ to: search.redirect ?? "/" });
    }
  },
  component: Login,
});

function Login() {
  const search = Route.useSearch();
  const { instanceClaimed, githubSignInConfigured, mockLoginAvailable } =
    Route.useRouteContext().session;

  // A full navigation rather than a router link: the flow leaves this origin for
  // github.com, which the client router has no way to do.
  const signInHref = githubSignInUrl({ redirect: search.redirect });
  const refusal = search.error == null ? undefined : describeRefusal(search.error);

  return (
    <main className="auth-shell">
      <div className="auth-panel">
        <img className="auth-mark" src="/dolshoe-mark.svg" alt="" />
        <h1>Sign in to Dolshoe</h1>

        {!instanceClaimed && (
          <p className="auth-note" role="status">
            This instance has no accounts yet. The first GitHub account to sign in becomes the owner
            of its default organization.
          </p>
        )}

        {refusal != null && (
          <p className="auth-error" role="alert">
            {refusal}
          </p>
        )}

        {githubSignInConfigured ? (
          <>
            <a className="github-button" href={signInHref}>
              <Github size={16} />
              Continue with GitHub
            </a>
            <p className="auth-hint">
              Dolshoe reads your GitHub profile and verified email address. It asks for no access to
              your repositories.
            </p>
          </>
        ) : (
          !mockLoginAvailable && (
            <p className="auth-note" role="alert">
              GitHub sign-in is not configured on this instance, so there is no way in yet. An
              operator needs to set <code>GITHUB_CLIENT_ID</code>, <code>GITHUB_CLIENT_SECRET</code>
              , and <code>GITHUB_CALLBACK_URL</code>.
            </p>
          )
        )}

        {/*
          Below whichever of the two branches above rendered, and shown even when
          no OAuth app is configured — skipping that setup is the entire point of
          running with the flag on.
        */}
        {mockLoginAvailable && <MockSignIn redirect={search.redirect} />}
      </div>
    </main>
  );
}
