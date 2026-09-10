import { StrictMode } from "react";
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
import { LogsReviewView } from "../screens/logs/logs-chrome";
import {
  isLogsScreenStateName,
  logsScreenStateNames,
  logsScreenStates,
} from "../screens/logs/logs-screen.states";
import { OrgSettingsReview } from "../screens/org-settings/org-settings-chrome";
import {
  isOrgSettingsStateName,
  orgSettingsStateNames,
  orgSettingsStates,
} from "../screens/org-settings/org-settings.states";
import { ProjectSettingsReview } from "../screens/project-settings/project-settings-chrome";
import {
  isProjectSettingsStateName,
  projectSettingsStateNames,
  projectSettingsStates,
} from "../screens/project-settings/project-settings.states";
import { ReportsNamedState } from "../screens/reports/reports-chrome";
import {
  isReportsViewStateName,
  reportsViewStateNames,
  reportsViewStates,
} from "../screens/reports/reports-view.states";
import { TracesReviewSurface } from "../screens/traces/traces-chrome";
import {
  isTracesScreenStateName,
  tracesScreenStateNames,
  tracesScreenStates,
} from "../screens/traces/traces-screen.states";
import "../styles.css";
import { ReviewFrame } from "./frame";

/**
 * The composition root that is not the route and not the construction test.
 *
 * @remarks
 * Playwright opens this page with `?surface=&state=`, the named factory of
 * that surface runs, and the matching public view is the only thing that
 * paints. `surface` defaults to `exception-tree` so the first surface's URLs
 * keep working unchanged. A further surface is another `if` branch — do not
 * grow a registry until the duplication is obvious. Investigation and
 * project settings drop the review card so the sidebar and trail sit on
 * the page edge.
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

function surfaceFromSearch(): string {
  return new URLSearchParams(window.location.search).get("surface") ?? "exception-tree";
}

const root = document.getElementById("root");
if (root == null) throw new Error("ui-review harness is missing #root");

const surface = surfaceFromSearch();

function view() {
  if (surface === "exception-tree") {
    const state = stateFromSearch(exceptionTreeStateNames, isExceptionTreeStateName);
    return <ExceptionTree {...exceptionTreeStates[state]()} />;
  }

  if (surface === "project-dashboard-overview") {
    const state = stateFromSearch(
      projectDashboardOverviewStateNames,
      isProjectDashboardOverviewStateName,
    );
    return <ProjectDashboardOverview {...projectDashboardOverviewStates[state]()} />;
  }

  if (surface === "investigation") {
    const state = stateFromSearch(investigationStateNames, isInvestigationStateName);
    return <InvestigationView {...investigationStates[state]()} />;
  }

  if (surface === "traces") {
    const state = stateFromSearch(tracesScreenStateNames, isTracesScreenStateName);
    return <TracesReviewSurface {...tracesScreenStates[state]()} />;
  }

  if (surface === "project-settings") {
    const state = stateFromSearch(projectSettingsStateNames, isProjectSettingsStateName);
    return <ProjectSettingsReview {...projectSettingsStates[state]()} />;
  }

  if (surface === "reports") {
    const state = stateFromSearch(reportsViewStateNames, isReportsViewStateName);
    return <ReportsNamedState {...reportsViewStates[state]()} />;
  }

  if (surface === "logs") {
    const state = stateFromSearch(logsScreenStateNames, isLogsScreenStateName);
    return <LogsReviewView {...logsScreenStates[state]()} />;
  }

  if (surface === "invitation") {
    const state = stateFromSearch(invitationStateNames, isInvitationStateName);
    return <InvitationView {...invitationStates[state]()} />;
  }

  if (surface === "org-settings") {
    const state = stateFromSearch(orgSettingsStateNames, isOrgSettingsStateName);
    return <OrgSettingsReview {...orgSettingsStates[state]()} />;
  }

  throw new Error(
    `Unknown surface ${JSON.stringify(surface)}. Expected "exception-tree", "project-dashboard-overview", "investigation", "traces", "project-settings", "reports", "logs", "invitation", or "org-settings".`,
  );
}

const fullPage = surface === "investigation" || surface === "project-settings";

createRoot(root).render(
  <StrictMode>
    <ReviewFrame
      fit={
        surface === "traces" ||
        surface === "reports" ||
        surface === "logs" ||
        surface === "org-settings"
      }
      framed={!fullPage}
      inset={!fullPage}
    >
      {view()}
    </ReviewFrame>
  </StrictMode>,
);
