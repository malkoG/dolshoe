import type { InvitationViewProps } from "./invitation-view";

/**
 * Named states for the invitation page.
 *
 * @remarks
 * Figma frames 83:43 (signed out) and 83:52 (signed in). There is no
 * empty or loading photograph: the card is up as soon as the link is
 * opened, and the route is what talks to the API. An accept failure is
 * an alert on the signed-in card — a label, not a second silhouette.
 */
function signedOut(): InvitationViewProps {
  return {
    githubHref: "/api/v1/auth/github/start?invitation=dsi_review",
  };
}

function signedIn(): InvitationViewProps {
  return {
    accountLabel: "@kodingwarrior",
    githubHref: "/api/v1/auth/github/start?invitation=dsi_review",
  };
}

export const invitationStates = {
  signedOut,
  signedIn,
} as const;

export const invitationStateNames = ["signedOut", "signedIn"] as const;

export type InvitationStateName = (typeof invitationStateNames)[number];

export function isInvitationStateName(value: string | null): value is InvitationStateName {
  return value != null && (invitationStateNames as readonly string[]).includes(value);
}
