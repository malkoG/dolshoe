import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { ApiError, describeError } from "../lib/api-request";
import { canAdminister } from "../lib/organizations";
import { updateProject } from "../lib/projects";
import { ProjectSettings } from "../screens/project-settings/project-settings";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/settings")({
  staticData: { breadcrumb: "Settings" },
  component: ProjectSettingsRoute,
});

const projectLayoutRoute = getRouteApi("/orgs/$orgSlug/projects/$projectId");

/**
 * Renaming a project. Nothing here is destructive — deleting a project is a
 * separate, later piece of work with its own confirmation design — so this is
 * a plain form, not a dialog.
 *
 * @remarks
 * This route is the composition root for `ProjectSettings` — the only thing
 * here that knows about `updateProject` or the session. The view itself only
 * ever sees values.
 */
function ProjectSettingsRoute() {
  const { orgSlug, projectId } = Route.useParams();
  const { organization } = Route.useRouteContext();
  const { projects } = projectLayoutRoute.useLoaderData();
  const project = projects.find((candidate) => candidate.id === projectId);
  const router = useRouter();

  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  if (project == null) return null;

  async function submit(): Promise<void> {
    if (saving) return;

    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      await updateProject(orgSlug, projectId, {
        name: name.trim(),
        slug: slug.trim(),
      });
      setSaved(true);
      // The heading and sidebar read this project's name from the layout
      // route's loader, not from this form's own state, so they only pick up
      // the rename once that loader re-runs.
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "A project with that slug already exists in this organization. Try a different one."
          : describeError(cause, "Something went wrong while renaming the project."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProjectSettings
      canAdminister={canAdminister(organization.role)}
      error={error}
      name={name}
      onNameChange={setName}
      onSlugChange={setSlug}
      onSubmit={() => void submit()}
      saved={saved}
      saving={saving}
      slug={slug}
    />
  );
}
