import { createFileRoute } from "@tanstack/react-router";

import { describeError } from "../lib/api-request";
import { fetchProjectDashboardSummary } from "../lib/dashboard-summary";
import { useResource } from "../lib/use-resource";
import { ProjectOverviewBody } from "../screens/overview/project-overview";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/")({
  staticData: { breadcrumb: "Overview" },
  component: ProjectOverview,
});

/**
 * A project's landing screen: recent activity across error reports, logs,
 * and traces, before a reader has picked any one of those sections to read.
 *
 * @remarks
 * Composition root for `ProjectOverviewBody`. The full Figma page — sidebar,
 * top bar, "Overview" heading — lives on the public view photographed by
 * silhouettes. This route only mounts the body: the frozen project layout
 * already paints PageShell and the slug/name heading.
 */
function ProjectOverview() {
  const { orgSlug, projectId } = Route.useParams();

  const { reload, state } = useResource(
    ({ signal }) => fetchProjectDashboardSummary(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  if (state.status === "loading") {
    return <ProjectOverviewBody body={{ status: "loading" }} />;
  }

  if (state.status === "error") {
    return (
      <ProjectOverviewBody
        body={{
          status: "error",
          description: describeError(
            state.error,
            "Something went wrong while loading the dashboard.",
          ),
          onRetry: reload,
        }}
      />
    );
  }

  return <ProjectOverviewBody body={{ status: "ready", summary: state.data }} />;
}
