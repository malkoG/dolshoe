import { DataState } from "@dolshoe/ui/components/data-state";
import { createFileRoute } from "@tanstack/react-router";

import { ProjectDashboardOverview } from "../components/project-dashboard-overview";
import { describeError } from "../lib/api-request";
import { fetchProjectDashboardSummary } from "../lib/dashboard-summary";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/")({
  staticData: { breadcrumb: "Overview" },
  component: ProjectOverview,
});

/**
 * A project's landing screen: recent activity across error reports, logs,
 * and traces, before a reader has picked any one of those sections to read.
 *
 * @remarks
 * This route is the composition root for `ProjectDashboardOverview` — the
 * only thing here that knows about `fetch` or the API client. The view
 * itself only ever sees a resolved `ProjectDashboardSummary`.
 */
function ProjectOverview() {
  const { orgSlug, projectId } = Route.useParams();

  const { reload, state } = useResource(
    ({ signal }) => fetchProjectDashboardSummary(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  if (state.status === "loading") {
    return (
      <DataState
        description="Fetching this project's recent activity."
        kind="loading"
        title="Loading dashboard…"
      />
    );
  }

  if (state.status === "error") {
    return (
      <DataState
        description={describeError(
          state.error,
          "Something went wrong while loading the dashboard.",
        )}
        kind="error"
        onRetry={reload}
        title="Couldn't load the dashboard"
      />
    );
  }

  return <ProjectDashboardOverview summary={state.data} />;
}
