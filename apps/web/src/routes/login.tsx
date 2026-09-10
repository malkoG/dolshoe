import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { SignInRefused, githubSignInUrl, mockSignIn } from "../lib/session";
import { describeRefusal } from "../lib/sign-in-refusals";
import {
  LOGIN_PRIVACY_NOTE,
  LOGIN_TITLE,
  LOGIN_UNCLAIMED_BODY,
  LoginView,
} from "../screens/login/login-view";

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

function describeMockFailure(error: unknown): string {
  if (error instanceof SignInRefused) return describeRefusal(error.code);
  if (error instanceof Error) return error.message;
  return "Something went wrong while signing in.";
}

function Login() {
  const search = Route.useSearch();
  const { instanceClaimed, githubSignInConfigured, mockLoginAvailable } =
    Route.useRouteContext().session;

  // A full navigation rather than a router link: the flow leaves this origin for
  // github.com, which the client router has no way to do.
  const signInHref = githubSignInUrl({ redirect: search.redirect });
  const refusal = search.error == null ? undefined : describeRefusal(search.error);

  const [login, setLogin] = useState("dev");
  const [submitting, setSubmitting] = useState(false);
  const [mockError, setMockError] = useState<string | undefined>(undefined);

  async function submitMock(): Promise<void> {
    if (submitting) return;

    setSubmitting(true);
    setMockError(undefined);
    try {
      const { organizationSlug } = await mockSignIn({ login });

      // A full navigation rather than a router one, for the same reason the
      // GitHub callback lands as a navigation: the root load has to run again to
      // pick up the session this just established.
      window.location.assign(
        organizationSlug == null ? (search.redirect ?? "/") : `/orgs/${organizationSlug}/projects`,
      );
    } catch (cause) {
      setMockError(describeMockFailure(cause));
      setSubmitting(false);
    }
  }

  return (
    <LoginView
      body={instanceClaimed ? undefined : LOGIN_UNCLAIMED_BODY}
      githubSignInHref={githubSignInConfigured ? signInHref : undefined}
      mockSignIn={
        mockLoginAvailable
          ? {
              login,
              submitting,
              error: mockError,
              onLoginChange: setLogin,
              onSubmit: () => {
                void submitMock();
              },
            }
          : undefined
      }
      note={githubSignInConfigured ? LOGIN_PRIVACY_NOTE : undefined}
      refusal={refusal}
      title={LOGIN_TITLE}
      unconfigured={!githubSignInConfigured && !mockLoginAvailable}
    />
  );
}
