import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import type { FormEvent } from "react";

/**
 * A project's settings screen: rename it, or be told you cannot.
 *
 * @remarks
 * This is a public view. It receives the form's values and paints them. The
 * route that submits the rename is the composition root; a construction test
 * and a silhouette are the other one. Those two wrap this view in the
 * private TopBar stub — the live route does not, because `PageShell`
 * already paints the trail.
 */
export interface ProjectSettingsProps {
  canAdminister: boolean;
  name: string;
  slug: string;
  saving?: boolean;
  saved?: boolean;
  error?: string;
  onNameChange?: (value: string) => void;
  onSlugChange?: (value: string) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

export function ProjectSettings({
  canAdminister,
  error,
  name,
  onNameChange,
  onSlugChange,
  onSubmit,
  saved = false,
  saving = false,
  slug,
}: ProjectSettingsProps) {
  return (
    <Panel>
      <PanelBar>
        <PanelSummary>Settings</PanelSummary>
      </PanelBar>

      {canAdminister ? (
        <form
          className="flex flex-col gap-4 px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.(event);
          }}
        >
          {error != null && error.length > 0 && (
            <p
              className="w-full rounded-md border border-border bg-brand-soft px-3 py-2 text-[12px] font-semibold text-brand"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="project-name">Name</Label>
            <Input
              className="max-w-sm"
              id="project-name"
              onChange={(event) => onNameChange?.(event.target.value)}
              readOnly={onNameChange == null}
              type="text"
              value={name}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="project-slug">Slug</Label>
            <Input
              className="max-w-sm font-mono"
              id="project-slug"
              onChange={(event) => onSlugChange?.(event.target.value)}
              readOnly={onSlugChange == null}
              type="text"
              value={slug}
            />
            <p className="text-[12px] text-muted-foreground">
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
            {saved && !saving && <span className="text-[12px] text-success">Saved.</span>}
          </div>
        </form>
      ) : (
        <p className="px-6 py-4 text-[13px] text-muted-foreground">
          An owner or admin of this organization renames a project.
        </p>
      )}
    </Panel>
  );
}
