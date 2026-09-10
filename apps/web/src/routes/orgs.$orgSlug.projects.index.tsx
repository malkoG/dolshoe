import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PageShell } from "../components/page-shell";
import { ApiError, describeError } from "../lib/api-request";
import { canAdminister } from "../lib/organizations";
import { createProject, fetchProjects } from "../lib/projects";
import { useResource } from "../lib/use-resource";
import { OrgProjects } from "../screens/org-projects/org-projects";

export const Route = createFileRoute("/orgs/$orgSlug/projects/")({
  staticData: { breadcrumb: "Projects" },
  component: Projects,
});

function Projects() {
  const { orgSlug } = Route.useParams();
  const navigate = useNavigate();
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
      const created = await createProject(orgSlug, { name: name.trim() });
      setName("");
      // Into the project rather than back to a list with one more row on it.
      // Nobody creates a project to look at its name: the next thing to do is
      // issue it a token and point something at it, and that is the screen this
      // lands on.
      await navigate({
        to: "/orgs/$orgSlug/projects/$projectId/reports",
        params: { orgSlug, projectId: created.id },
      });
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
      <OrgProjects
        create={
          canAdminister(organization.role)
            ? {
                error: createError,
                name,
                onNameChange: setName,
                onSubmit: (event) => {
                  void submit(event);
                },
                submitting: creating,
              }
            : undefined
        }
        list={
          state.status === "loading"
            ? { status: "loading" }
            : state.status === "error"
              ? {
                  description: describeError(
                    state.error,
                    "Something went wrong while loading projects.",
                  ),
                  onRetry: reload,
                  status: "error",
                }
              : {
                  projects: state.data.map((project) => ({
                    createdAt: project.createdAt,
                    href: `/orgs/${orgSlug}/projects/${project.id}/reports`,
                    id: project.id,
                    name: project.name,
                    slug: project.slug,
                  })),
                  status: "ready",
                }
        }
      />
    </PageShell>
  );
}
