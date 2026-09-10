import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { ExceptionTree } from "../components/exception-tree";
import {
  exceptionTreeStateNames,
  exceptionTreeStates,
  isExceptionTreeStateName,
} from "../components/exception-tree.states";
import { ProjectDashboardOverview } from "../components/project-dashboard-overview";
import {
  isProjectDashboardOverviewStateName,
  projectDashboardOverviewStateNames,
  projectDashboardOverviewStates,
} from "../components/project-dashboard-overview.states";
import { Alerts } from "../screens/alerts/alerts";
import { alertsStateNames, alertsStates, isAlertsStateName } from "../screens/alerts/alerts.states";
import { InvestigationView } from "../screens/investigation/investigation";
import {
  investigationStateNames,
  investigationStates,
  isInvestigationStateName,
} from "../screens/investigation/investigation.states";
import { InvitationView } from "../screens/invitation/invitation-view";
import {
  invitationStateNames,
  invitationStates,
  isInvitationStateName,
} from "../screens/invitation/invitation-view.states";
import { LoginView } from "../screens/login/login-view";
import {
  isLoginViewStateName,
  loginViewStateNames,
  loginViewStates,
} from "../screens/login/login-view.states";
import { LogsReviewView } from "../screens/logs/logs-chrome";
import {
  isLogsScreenStateName,
  logsScreenStateNames,
  logsScreenStates,
} from "../screens/logs/logs-screen.states";
import { OrgProjectsReview } from "../screens/org-projects/org-chrome";
import {
  isOrgProjectsStateName,
  orgProjectsStateNames,
  orgProjectsStates,
} from "../screens/org-projects/org-projects.states";
import { OrgSettingsReview } from "../screens/org-settings/org-settings-chrome";
import {
  isOrgSettingsStateName,
  orgSettingsStateNames,
  orgSettingsStates,
} from "../screens/org-settings/org-settings.states";
import { ProjectOverview } from "../screens/overview/project-overview";
import {
  isProjectOverviewStateName,
  projectOverviewStateNames,
  projectOverviewStates,
} from "../screens/overview/project-overview.states";
import { ProjectSettingsReview } from "../screens/project-settings/project-settings-chrome";
import {
  isProjectSettingsStateName,
  projectSettingsStateNames,
  projectSettingsStates,
} from "../screens/project-settings/project-settings.states";
import { ReportDetail } from "../screens/report-detail/report-detail";
import {
  isReportDetailStateName,
  reportDetailStateNames,
  reportDetailStates,
} from "../screens/report-detail/report-detail.states";
import { ReportsNamedState } from "../screens/reports/reports-chrome";
import {
  isReportsViewStateName,
  reportsViewStateNames,
  reportsViewStates,
} from "../screens/reports/reports-view.states";
import { TokensScreen } from "../screens/tokens/tokens-screen";
import {
  isTokensScreenStateName,
  tokensScreenStateNames,
  tokensScreenStates,
} from "../screens/tokens/tokens-screen.states";
import { TracesReviewSurface } from "../screens/traces/traces-chrome";
import {
  isTracesScreenStateName,
  tracesScreenStateNames,
  tracesScreenStates,
} from "../screens/traces/traces-screen.states";
import "../styles.css";
import { ReviewFrame } from "./frame";
import { surfaceByName, surfaceNames, type SurfaceName } from "./surfaces";

/**
 * The composition root that is not the route and not the construction test.
 *
 * @remarks
 * Playwright opens this page with `?surface=&state=`, the named factory of
 * that surface runs, and the matching public view is the only thing that
 * paints. `surface` defaults to `exception-tree` so the first surface's URLs
 * keep working unchanged. Paper and viewport live in `surfaces.ts` — a
 * further screen is one registry row plus a mount, not another `if`.
 */
function stateFromSearch<Name extends string>(
  names: readonly Name[],
  isName: (value: string | null) => value is Name,
): Name {
  const name = new URLSearchParams(window.location.search).get("state");
  if (isName(name)) return name;

  throw new Error(
    `Unknown named state ${JSON.stringify(name)}. Expected one of: ${names.join(", ")}.`,
  );
}

function namedView<Name extends string, Props>(
  names: readonly Name[],
  isName: (value: string | null) => value is Name,
  states: { readonly [K in Name]: () => Props },
  View: (props: Props) => ReactNode,
): ReactNode {
  const name = stateFromSearch(names, isName);
  return View(states[name]());
}

function surfaceFromSearch(): string {
  return new URLSearchParams(window.location.search).get("surface") ?? "exception-tree";
}

const mounts = {
  "exception-tree": () =>
    namedView(
      exceptionTreeStateNames,
      isExceptionTreeStateName,
      exceptionTreeStates,
      ExceptionTree,
    ),
  "project-dashboard-overview": () =>
    namedView(
      projectDashboardOverviewStateNames,
      isProjectDashboardOverviewStateName,
      projectDashboardOverviewStates,
      ProjectDashboardOverview,
    ),
  investigation: () =>
    namedView(
      investigationStateNames,
      isInvestigationStateName,
      investigationStates,
      InvestigationView,
    ),
  traces: () =>
    namedView(
      tracesScreenStateNames,
      isTracesScreenStateName,
      tracesScreenStates,
      TracesReviewSurface,
    ),
  "project-settings": () =>
    namedView(
      projectSettingsStateNames,
      isProjectSettingsStateName,
      projectSettingsStates,
      ProjectSettingsReview,
    ),
  reports: () =>
    namedView(reportsViewStateNames, isReportsViewStateName, reportsViewStates, ReportsNamedState),
  logs: () =>
    namedView(logsScreenStateNames, isLogsScreenStateName, logsScreenStates, LogsReviewView),
  invitation: () =>
    namedView(invitationStateNames, isInvitationStateName, invitationStates, InvitationView),
  login: () => namedView(loginViewStateNames, isLoginViewStateName, loginViewStates, LoginView),
  "org-settings": () =>
    namedView(orgSettingsStateNames, isOrgSettingsStateName, orgSettingsStates, OrgSettingsReview),
  overview: () =>
    namedView(
      projectOverviewStateNames,
      isProjectOverviewStateName,
      projectOverviewStates,
      ProjectOverview,
    ),
  alerts: () => namedView(alertsStateNames, isAlertsStateName, alertsStates, Alerts),
  "report-detail": () =>
    namedView(reportDetailStateNames, isReportDetailStateName, reportDetailStates, ReportDetail),
  "org-projects": () =>
    namedView(orgProjectsStateNames, isOrgProjectsStateName, orgProjectsStates, OrgProjectsReview),
  tokens: () =>
    namedView(tokensScreenStateNames, isTokensScreenStateName, tokensScreenStates, TokensScreen),
} satisfies Record<SurfaceName, () => ReactNode>;

const root = document.getElementById("root");
if (root == null) throw new Error("ui-review harness is missing #root");

const requested = surfaceFromSearch();
const surface = surfaceByName(requested);
if (surface == null) {
  throw new Error(
    `Unknown surface ${JSON.stringify(requested)}. Expected ${surfaceNames().join(", ")}.`,
  );
}

createRoot(root).render(
  <StrictMode>
    <ReviewFrame paper={surface.paper}>{mounts[surface.name]()}</ReviewFrame>
  </StrictMode>,
);
