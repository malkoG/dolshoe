import type { OrgSettingsProps } from "./org-settings";

/**
 * Named states for organization settings.
 *
 * @remarks
 * The view receives values and paints them. These factories are the other
 * composition root — the one a construction test and a silhouette use
 * instead of talking to the API.
 *
 * Figma publishes two frames: the ordinary admin form, and the 409 the
 * leave command paints when the viewer is the only owner. There is no
 * empty or idle here. A member who cannot rename is a real route state,
 * but it is the same leave panel with one panel omitted — a construction
 * assertion, not a second silhouette.
 */
function idleCommands(): Pick<OrgSettingsProps, "onLeave" | "onNameChange" | "onRename"> {
  return {
    onLeave: () => undefined,
    onNameChange: () => undefined,
    onRename: () => undefined,
  };
}

function admin(): OrgSettingsProps {
  return {
    ...idleCommands(),
    canRename: true,
    leaving: false,
    name: "Acme Payments",
    renaming: false,
  };
}

/**
 * The leave command came back 409: this viewer is the only owner.
 *
 * @remarks
 * This is the layout the second Figma frame exists to make obvious. The
 * rename panel stays put; the refusal sits under the leave button.
 */
function leaveRefused(): OrgSettingsProps {
  return {
    ...admin(),
    leaveError: "You're the only owner — promote another member first.",
  };
}

export const orgSettingsStates = {
  admin,
  leaveRefused,
} as const;

export const orgSettingsStateNames = ["admin", "leaveRefused"] as const;

export type OrgSettingsStateName = (typeof orgSettingsStateNames)[number];

export function isOrgSettingsStateName(value: string | null): value is OrgSettingsStateName {
  return value != null && (orgSettingsStateNames as readonly string[]).includes(value);
}
