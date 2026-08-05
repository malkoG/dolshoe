import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel, PanelBar, PanelControls, PanelSummary } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Boxes, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import { PageShell } from "../components/page-shell";
import { ApiError, describeError } from "../lib/api-request";
import { dateFormatter, pluralize } from "../lib/format";
import { canAdminister } from "../lib/organizations";
import { createProject, fetchProjects } from "../lib/projects";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/")({ component: Projects });

function Projects() {
  const { orgSlug } = Route.useParams();
  const { organization, session } = Route.useRouteContext();
  const { organizations, viewer } = session;
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  const { reload, state } = useResource(
    ({ signal }) => fetchProjects(orgSlug, { signal }),
    [orgSlug],
  );

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (creating || name.trim().length === 0) return;

    setCreating(true);
    setCreateError(undefined);
    try {
      await createProject(orgSlug, { name: name.trim() });
      setName("");
      reload();
    } catch (error) {
      // A taken slug is the one failure the operator can fix inline, so it is
      // reported on the field rather than as a page-level error.
      setCreateError(
        error instanceof ApiError && error.status === 409
          ? "A project with that slug already exists. Try a different name."
          : describeError(error, "Something went wrong while creating the project."),
      );
    } finally {
      setCreating(false);
    }
  }

  const projects = state.status === "ready" ? state.data : [];

  return (
    <PageShell
      organizations={organizations}
      orgSlug={orgSlug}
      projects={projects}
      viewer={viewer ?? undefined}
    >
      <PageHeading
        description="A project owns the ingestion tokens your applications report with, and every event those tokens deliver."
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Boxes className="size-3.5" />
            One token set per project
          </span>
        }
      >
        Projects
      </PageHeading>

      <Panel>
        <PanelBar>
          <PanelSummary>
            {state.status === "ready" ? pluralize(projects.length, "project") : "Projects"}
          </PanelSummary>

          {/*
            Hidden rather than disabled for a member: the API refuses this with
            a 403, so offering a control that always fails would be a worse
            answer than not offering it.
          */}
          {canAdminister(organization.role) && (
            <PanelControls>
              <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
                <Label className="sr-only" htmlFor="project-name">
                  New project name
                </Label>
                <Input
                  className="w-full sm:w-[230px]"
                  id="project-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="New project name…"
                  type="text"
                  value={name}
                />
                <Button disabled={creating} type="submit">
                  {creating ? <Spinner /> : <Plus />}
                  Create project
                </Button>
              </form>
            </PanelControls>
          )}
        </PanelBar>

        {createError && (
          <p
            className="border-b border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
            role="alert"
          >
            {createError}
          </p>
        )}

        <div aria-live="polite">
          {state.status === "loading" && (
            <DataState
              kind="loading"
              title="Loading projects…"
              description="Fetching them from the API."
            />
          )}

          {state.status === "error" && (
            <DataState
              kind="error"
              title="Couldn't load projects"
              description={describeError(
                state.error,
                "Something went wrong while loading projects.",
              )}
              onRetry={reload}
            />
          )}

          {state.status === "ready" && projects.length === 0 && (
            <DataState
              kind="empty"
              icon={Boxes}
              title="No projects yet"
              description="Create one, issue it a token, and point a reporter at the DSN it gives you."
            />
          )}

          {state.status === "ready" && projects.length > 0 && (
            <ul>
              {projects.map((project) => (
                <li className="border-b border-border last:border-b-0" key={project.id}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-muted"
                    params={{ orgSlug, projectId: project.id }}
                    to="/orgs/$orgSlug/projects/$projectId/reports"
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-[13px] font-bold">
                        {project.name}
                      </strong>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {project.slug}
                      </span>
                    </div>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      Created {dateFormatter.format(new Date(project.createdAt))}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </PageShell>
  );
}
