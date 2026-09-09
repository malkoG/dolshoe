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
import "../styles.css";
import { ReviewFrame } from "./frame";

/**
 * The composition root that is not the route and not the construction test.
 *
 * @remarks
 * Playwright opens this page with `?surface=&state=`, the named factory of
 * that surface runs, and the matching public view is the only thing that
 * paints. `surface` defaults to `exception-tree` so the first surface's URLs
 * keep working unchanged. Add a third surface as another `if` branch here —
 * do not grow a registry until a third caller has made the duplication
 * obvious.
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

  throw new Error(
    `Unknown surface ${JSON.stringify(surface)}. Expected "exception-tree" or "project-dashboard-overview".`,
  );
}

createRoot(root).render(
  <StrictMode>
    <ReviewFrame>{view()}</ReviewFrame>
  </StrictMode>,
);
