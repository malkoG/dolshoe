import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

import { PageShell } from "../components/page-shell";
import { fetchProjects } from "../lib/projects";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId")({
  component: ProjectLayout,
});

/**
 * Everything inside a project: the heading, the section tabs, and whichever
 * section is active. Loading the project list here means the top bar's switcher
 * and the heading come from one request rather than one per section.
 */
function ProjectLayout() {
  const { orgSlug, projectId } = Route.useParams();
  const { session } = Route.useRouteContext();

  const { state } = useResource(({ signal }) => fetchProjects(orgSlug, { signal }), [orgSlug]);

  const projects = state.status === "ready" ? state.data : [];
  const project = projects.find((candidate) => candidate.id === projectId);
  const missing = state.status === "ready" && project == null;

  return (
    <PageShell
      activeProjectId={projectId}
      organizations={session.organizations}
      orgSlug={orgSlug}
      projects={projects}
      viewer={session.viewer ?? undefined}
    >
      {/*
        The sidebar already carries the project and the way back out, so the
        heading only needs to name where you are.
      */}
      <PageHeading eyebrow={project?.slug ?? "…"}>{project?.name ?? " "}</PageHeading>

      {missing ? (
        <Panel>
          <DataState
            kind="error"
            title="No such project"
            description="It may have been deleted, or the link may be out of date."
            action={
              <Button asChild size="sm" variant="outline">
                <Link params={{ orgSlug }} to="/orgs/$orgSlug/projects">
                  Back to projects
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <Outlet />
      )}
    </PageShell>
  );
}
