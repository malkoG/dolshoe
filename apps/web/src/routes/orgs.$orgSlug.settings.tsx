import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { PageShell } from "../components/page-shell";
import { ApiError, describeError } from "../lib/api-request";
import { canAdminister, leaveOrganization, updateOrganization } from "../lib/organizations";
import { ONLY_OWNER_LEAVE_REFUSAL, OrgSettings } from "../screens/org-settings/org-settings";

export const Route = createFileRoute("/orgs/$orgSlug/settings")({
  staticData: { breadcrumb: "Settings" },
  component: Settings,
});

function Settings() {
  const { orgSlug } = Route.useParams();
  const { organization, session } = Route.useRouteContext();
  const router = useRouter();

  const [name, setName] = useState(organization.name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);

  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | undefined>(undefined);

  async function rename(): Promise<void> {
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
          ? ONLY_OWNER_LEAVE_REFUSAL
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
      <OrgSettings
        canRename={canAdminister(organization.role)}
        leaveError={leaveError}
        leaving={leaving}
        name={name}
        onLeave={() => void leave()}
        onNameChange={setName}
        onRename={() => void rename()}
        renameError={renameError}
        renaming={renaming}
      />
    </PageShell>
  );
}
