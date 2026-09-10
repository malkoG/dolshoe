import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";

import { SettingsCallout } from "./settings-callout";

/** Copy the API's 409 maps onto, and the leave-refused silhouette photographs. */
export const ONLY_OWNER_LEAVE_REFUSAL = "You're the only owner — promote another member first.";

export type OrgSettingsProps = {
  canRename: boolean;
  leaveError?: string;
  leaving: boolean;
  name: string;
  onLeave: () => void;
  onNameChange: (name: string) => void;
  onRename: () => void;
  renameError?: string;
  renaming: boolean;
};

/**
 * Organization settings: rename (owners and admins) and leave.
 *
 * @remarks
 * A public view. It receives values and commands; the route is the
 * composition root that talks to the API. Leave fires immediately — Figma
 * has no confirmation — and a 409 paints {@link ONLY_OWNER_LEAVE_REFUSAL}.
 */
export function OrgSettings({
  canRename,
  leaveError,
  leaving,
  name,
  onLeave,
  onNameChange,
  onRename,
  renameError,
  renaming,
}: OrgSettingsProps) {
  return (
    <>
      <PageHeading description="Rename this organization, or leave it.">Settings</PageHeading>

      {canRename && (
        <Panel className="mb-space-4">
          <PanelBar>
            <PanelSummary>Organization name</PanelSummary>
          </PanelBar>
          <form
            className="flex flex-col gap-space-3 p-space-5"
            onSubmit={(event) => {
              event.preventDefault();
              onRename();
            }}
          >
            <div className="flex flex-wrap items-end gap-space-3">
              <div className="flex w-80 flex-col gap-space-1">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  onChange={(event) => onNameChange(event.target.value)}
                  type="text"
                  value={name}
                />
              </div>
              <Button disabled={renaming || name.trim().length === 0} type="submit">
                {renaming && <Spinner />}
                Save
              </Button>
            </div>
            {renameError != null && <SettingsCallout>{renameError}</SettingsCallout>}
          </form>
        </Panel>
      )}

      <Panel>
        <PanelBar>
          <PanelSummary>Leave this organization</PanelSummary>
        </PanelBar>
        <div className="flex flex-col items-start gap-space-3 p-space-5">
          <p className="max-w-md text-sm text-muted-foreground">
            You'll lose access to every project here. Someone can invite you back later.
          </p>
          <Button disabled={leaving} onClick={onLeave} type="button" variant="destructive">
            {leaving && <Spinner />}
            Leave organization
          </Button>
          {leaveError != null && <SettingsCallout>{leaveError}</SettingsCallout>}
        </div>
      </Panel>
    </>
  );
}
