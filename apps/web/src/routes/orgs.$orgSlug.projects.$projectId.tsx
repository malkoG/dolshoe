import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { PageShell } from "../components/page-shell";
import { fetchProjects } from "../lib/projects";
import type { Project } from "../lib/projects";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId")({
  component: ProjectLayout,
});

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; projects: Project[] };

/**
 * Everything inside a project: the heading, the section tabs, and whichever
 * section is active. Loading the project list here means the top bar's switcher
 * and the heading come from one request rather than one per section.
 */
function ProjectLayout() {
  const { orgSlug, projectId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchProjects(orgSlug, { signal: controller.signal })
      .then((projects) => {
        if (!cancelled) setState({ status: "ready", projects });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [orgSlug]);

  const projects = state.status === "ready" ? state.projects : [];
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
      <section className="page-heading">
        <div>
          {/* The sidebar already carries the project and the way back out, so
              the heading only needs to name where you are. */}
          <div className="eyebrow">{project?.slug ?? "…"}</div>
          <h1>{project?.name ?? " "}</h1>
        </div>
      </section>

      {missing ? (
        <section className="report-panel">
          <div className="state-panel state-panel-error" role="alert">
            <span className="state-icon">
              <AlertTriangle size={19} />
            </span>
            <strong>No such project</strong>
            <p>It may have been deleted, or the link may be out of date.</p>
            <Link params={{ orgSlug }} to="/orgs/$orgSlug/projects">
              Back to projects
            </Link>
          </div>
        </section>
      ) : (
        <Outlet />
      )}
    </PageShell>
  );
}
