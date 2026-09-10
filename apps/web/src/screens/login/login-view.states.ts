import { describeRefusal } from "../../lib/sign-in-refusals";
import {
  LOGIN_PRIVACY_NOTE,
  LOGIN_TITLE,
  LOGIN_UNCLAIMED_BODY,
  type LoginViewProps,
} from "./login-view";

/**
 * Named states for the login page.
 *
 * @remarks
 * Figma "10 Login" photographs two compositions: the ordinary unclaimed
 * instance (`default`, node 83:2) and the same card with an allowlist
 * refusal plus the development form (`refused`, node 83:11). Those are
 * the silhouettes. Label-only variants — a claimed instance, a missing
 * OAuth app — stay as conditionals on the view.
 */
function noop(): void {}

function defaultState(): LoginViewProps {
  return {
    title: LOGIN_TITLE,
    body: LOGIN_UNCLAIMED_BODY,
    note: LOGIN_PRIVACY_NOTE,
    githubSignInHref: "/api/v1/auth/github/start",
  };
}

function refused(): LoginViewProps {
  return {
    title: LOGIN_TITLE,
    body: LOGIN_UNCLAIMED_BODY,
    note: LOGIN_PRIVACY_NOTE,
    githubSignInHref: "/api/v1/auth/github/start",
    refusal: describeRefusal("not_allowed"),
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
