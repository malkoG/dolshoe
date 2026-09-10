import type { ProjectSettingsProps } from "./project-settings";

/**
 * Named states for project settings.
 *
 * @remarks
 * The view is a public view: it receives the form's values and paints them.
 * These factories are the other composition root — the one a construction
 * test and a silhouette use instead of submitting a rename.
 *
 * The three frames Figma published are the three states the surface can
 * actually show a reviewer: an admin who just saved, a 409 on the slug, and
 * a member who cannot rename. There is no idle photograph — it is the saved
 * silhouette without the "Saved." label. There is no in-progress photograph
 * either; a spinner on Save is a label change, not a second layout.
 */
const SLUG_CONFLICT =
  "A project with that slug already exists in this organization. Try a different one.";

function saved(): ProjectSettingsProps {
  return {
    canAdminister: true,
    name: "checkout-api",
    saved: true,
    slug: "checkout-api",
  };
}

function error(): ProjectSettingsProps {
  return {
    canAdminister: true,
    error: SLUG_CONFLICT,
    name: "checkout-api",
    slug: "payments",
  };
}

function readOnly(): ProjectSettingsProps {
  return {
    canAdminister: false,
    name: "checkout-api",
    slug: "checkout-api",
  };
}

export const projectSettingsStates = {
  saved,
  error,
  readOnly,
} as const;

export const projectSettingsStateNames = ["saved", "error", "readOnly"] as const;

export type ProjectSettingsStateName = (typeof projectSettingsStateNames)[number];

export function isProjectSettingsStateName(
  value: string | null,
): value is ProjectSettingsStateName {
  return value != null && (projectSettingsStateNames as readonly string[]).includes(value);
}
