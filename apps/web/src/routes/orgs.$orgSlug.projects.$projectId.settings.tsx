import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { ApiError, describeError } from "../lib/api-request";
import { canAdminister } from "../lib/organizations";
import { updateProject } from "../lib/projects";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/settings")({
  staticData: { breadcrumb: "Settings" },
  component: ProjectSettings,
});

const projectLayoutRoute = getRouteApi("/orgs/$orgSlug/projects/$projectId");

/**
 * Renaming a project. Nothing here is destructive — deleting a project is a
 * separate, later piece of work with its own confirmation design — so this is
 * a plain form, not a dialog.
 */
function ProjectSettings() {
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

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
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

  if (!canAdminister(organization.role)) {
    return (
      <Panel>
        <PanelBar>
          <PanelSummary>Settings</PanelSummary>
        </PanelBar>
        <p className="px-5 py-4 text-[13px] text-muted-foreground">
          An owner or admin of this organization renames a project.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelBar>
        <PanelSummary>Settings</PanelSummary>
      </PanelBar>

      {error && (
        <p
          className="border-b border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
          role="alert"
        >
          {error}
        </p>
      )}

      <form className="flex flex-col gap-4 px-5 py-4" onSubmit={(event) => void submit(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-name">Name</Label>
          <Input
            className="max-w-sm"
            id="project-name"
            onChange={(event) => setName(event.target.value)}
            type="text"
            value={name}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-slug">Slug</Label>
          <Input
            className="max-w-sm font-mono"
            id="project-slug"
            onChange={(event) => setSlug(event.target.value)}
            type="text"
            value={slug}
          />
          <p className="text-[11px] text-muted-foreground">
            Cosmetic only: nothing in this application routes on it.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            disabled={saving || (name.trim().length === 0 && slug.trim().length === 0)}
            type="submit"
          >
            {saving && <Spinner />}
            Save
          </Button>
          {saved && !saving && <span className="text-[11px] text-success">Saved.</span>}
        </div>
      </form>
    </Panel>
  );
}
