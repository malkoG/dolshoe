import type { LoginViewProps } from "./login-view";

/**
 * Named states for the login page.
 *
 * @remarks
 * Figma "10 Login" photographs two compositions: the ordinary unclaimed
 * instance (`default`, node 83:2) and the same card with an allowlist
 * refusal plus the development form (`refused`, node 83:11). Those are
 * the silhouettes. Label-only variants — a claimed instance, a missing
 * OAuth app — stay as conditionals on the view.
 *
 * This file is imported by the silhouette capture script under Node's
 * type-stripping loader, so it must not have value imports — only the
 * type of the props, the way ExceptionTree's factories do.
 */
function noop(): void {}

function defaultState(): LoginViewProps {
  return {
    title: "Sign in to Dolshoe",
    body: "This instance has no accounts yet. The first GitHub account to sign in becomes the owner of its default organization.",
    note: "Dolshoe reads your GitHub profile and verified email address. It asks for no access to your repositories.",
    githubSignInHref: "/api/v1/auth/github/start",
  };
}

function refused(): LoginViewProps {
  return {
    title: "Sign in to Dolshoe",
    body: "This instance has no accounts yet. The first GitHub account to sign in becomes the owner of its default organization.",
    note: "Dolshoe reads your GitHub profile and verified email address. It asks for no access to your repositories.",
    githubSignInHref: "/api/v1/auth/github/start",
    refusal: "That GitHub account is not on this instance's allowlist. Ask an operator to add it.",
    mockSignIn: {
      login: "dev",
      submitting: false,
      onLoginChange: noop,
      onSubmit: noop,
    },
  };
}

export const loginViewStates = {
  default: defaultState,
  refused,
} as const;

export const loginViewStateNames = ["default", "refused"] as const;

export type LoginViewStateName = (typeof loginViewStateNames)[number];

export function isLoginViewStateName(value: string | null): value is LoginViewStateName {
  return value != null && (loginViewStateNames as readonly string[]).includes(value);
}
