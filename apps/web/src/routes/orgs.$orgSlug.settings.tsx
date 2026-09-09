import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { PageShell } from "../components/page-shell";
import { ApiError, describeError } from "../lib/api-request";
import { canAdminister, leaveOrganization, updateOrganization } from "../lib/organizations";

export const Route = createFileRoute("/orgs/$orgSlug/settings")({ component: Settings });

function Settings() {
  const { orgSlug } = Route.useParams();
  const { organization, session } = Route.useRouteContext();
  const router = useRouter();

  const [name, setName] = useState(organization.name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | undefined>(undefined);

  const administers = canAdminister(organization.role);

  async function rename(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (renaming || name.trim().length === 0) return;

    setRenaming(true);
    setRenameError(undefined);
    try {
      await updateOrganization(orgSlug, { name: name.trim() });
      // The name every route reads comes from the root loader's session, not
      // from this component's own state.
      await router.invalidate();
    } catch (error) {
      setRenameError(describeError(error, "Something went wrong while renaming the organization."));
    } finally {
      setRenaming(false);
    }
  }

  async function leave(): Promise<void> {
    if (leaving) return;

    setLeaving(true);
    setLeaveError(undefined);
    try {
      await leaveOrganization(orgSlug);
      await router.navigate({ to: "/orgs" });
    } catch (error) {
      setLeaveError(
        error instanceof ApiError && error.status === 409
          ? "You're the only owner — promote another member first."
          : describeError(error, "Something went wrong while leaving the organization."),
      );
      setLeaving(false);
    }
  }

  return (
    <PageShell
      organizations={session.organizations}
      orgSlug={orgSlug}
      viewer={session.viewer ?? undefined}
    >
      <PageHeading description="Rename this organization, or leave it." eyebrow={organization.slug}>
        Settings
      </PageHeading>

      {administers && (
        <Panel className="mb-4">
          <PanelBar>
            <PanelSummary>Organization name</PanelSummary>
          </PanelBar>
          <form
            className="flex flex-wrap items-end gap-3 p-5"
            onSubmit={(event) => void rename(event)}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                onChange={(event) => setName(event.target.value)}
                type="text"
                value={name}
              />
            </div>
            <Button className="mb-px" disabled={renaming || name.trim().length === 0} type="submit">
              {renaming && <Spinner />}
              Save
            </Button>
          </form>
          {renameError != null && (
            <p
              className="mx-5 mb-5 rounded-md border border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
              role="alert"
            >
              {renameError}
            </p>
          )}
        </Panel>
      )}

      <Panel>
        <PanelBar>
          <PanelSummary>Leave this organization</PanelSummary>
        </PanelBar>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="max-w-md text-[13px] text-muted-foreground">
            You'll lose access to every project here. Someone can invite you back later.
          </p>
          <Button
            disabled={leaving}
            onClick={() => void leave()}
            type="button"
            variant="destructive"
          >
            {leaving && <Spinner />}
            Leave organization
          </Button>
        </div>
        {leaveError != null && (
          <p
            className="mx-5 mb-5 rounded-md border border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
            role="alert"
          >
            {leaveError}
          </p>
        )}
      </Panel>
    </PageShell>
  );
}
