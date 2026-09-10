import { exceptionTreeStateNames } from "../components/exception-tree.states.ts";
import { projectDashboardOverviewStateNames } from "../components/project-dashboard-overview.states.ts";
import { alertsStateNames } from "../screens/alerts/alerts.states.ts";
import { investigationStateNames } from "../screens/investigation/investigation.states.ts";
import { invitationStateNames } from "../screens/invitation/invitation-view.states.ts";
import { loginViewStateNames } from "../screens/login/login-view.states.ts";
import { logsScreenStateNames } from "../screens/logs/logs-screen.states.ts";
import { orgProjectsStateNames } from "../screens/org-projects/org-projects.states.ts";
import { orgSettingsStateNames } from "../screens/org-settings/org-settings.states.ts";
import { projectOverviewStateNames } from "../screens/overview/project-overview.states.ts";
import { projectSettingsStateNames } from "../screens/project-settings/project-settings.states.ts";
import { reportDetailStateNames } from "../screens/report-detail/report-detail.states.ts";
import { reportsViewStateNames } from "../screens/reports/reports-view.states.ts";
import { tokensScreenStateNames } from "../screens/tokens/tokens-screen.states.ts";
import { tracesScreenStateNames } from "../screens/traces/traces-screen.states.ts";

/**
 * How a silhouette sits on the review paper.
 *
 * `panel` — widget or shell-outside card, padded and framed (1100×720 unless
 * overridden). `framed-fit` — private 1440×960 chrome inside a fitted card
 * (viewport 1600×1120 so `p-8` still clears the page). `full-page` — drop
 * the card so Sidebar + TopBar sit flush (1440×960 unless a taller PASS
 * locked a different height).
 */
export type ReviewPaper = "panel" | "framed-fit" | "full-page";

export const DEFAULT_VIEWPORT: Record<ReviewPaper, { width: number; height: number }> = {
  panel: { width: 1100, height: 720 },
  "framed-fit": { width: 1600, height: 1120 },
  "full-page": { width: 1440, height: 960 },
};

export interface Surface {
  readonly name: string;
  readonly paper: ReviewPaper;
  readonly states: readonly string[];
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly stateViewports?: Readonly<Record<string, { width: number; height: number }>>;
  readonly screenshot?: "root" | "page";
}

/**
 * Every surface the harness can photograph, with the paper and viewport
 * its design PASS locked.
 *
 * `overview` is Figma 20's full board (private chrome + body).
 * `project-dashboard-overview` is only the dashboard widget that board
 * (and the live route) mount in the body slot.
 */
export const SURFACES = [
  { name: "exception-tree", paper: "panel", states: exceptionTreeStateNames },
  {
    name: "project-dashboard-overview",
    paper: "panel",
    states: projectDashboardOverviewStateNames,
  },
  {
    name: "investigation",
    paper: "full-page",
    states: investigationStateNames,
    viewport: { width: 1440, height: 1106 },
  },
  { name: "traces", paper: "framed-fit", states: tracesScreenStateNames },
  { name: "project-settings", paper: "full-page", states: projectSettingsStateNames },
  { name: "reports", paper: "framed-fit", states: reportsViewStateNames },
  { name: "logs", paper: "framed-fit", states: logsScreenStateNames },
  { name: "invitation", paper: "panel", states: invitationStateNames },
  { name: "login", paper: "panel", states: loginViewStateNames },
  { name: "org-settings", paper: "full-page", states: orgSettingsStateNames },
  { name: "overview", paper: "framed-fit", states: projectOverviewStateNames },
  {
    name: "alerts",
    paper: "panel",
    states: alertsStateNames,
    viewport: { width: 1440, height: 960 },
  },
  {
    name: "report-detail",
    paper: "full-page",
    states: reportDetailStateNames,
    viewport: { width: 1440, height: 1132 },
  },
  {
    name: "org-projects",
    paper: "full-page",
    states: orgProjectsStateNames,
    stateViewports: {
      compact: { width: 1024, height: 960 },
    },
  },
  {
    name: "tokens",
    paper: "full-page",
    screenshot: "page",
    states: tokensScreenStateNames,
    viewport: { width: 1440, height: 1006 },
  },
] as const satisfies readonly Surface[];

export type SurfaceName = (typeof SURFACES)[number]["name"];

export function surfaceByName(name: string): (typeof SURFACES)[number] | undefined {
  return SURFACES.find((surface) => surface.name === name);
}

export function surfaceNames(): SurfaceName[] {
  return SURFACES.map((surface) => surface.name);
}

export function viewportFor(surface: Surface, state: string): { width: number; height: number } {
  return surface.stateViewports?.[state] ?? surface.viewport ?? DEFAULT_VIEWPORT[surface.paper];
}

export function screenshotOf(surface: Surface): "root" | "page" {
  return surface.screenshot ?? "root";
}
