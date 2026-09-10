import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageShell } from "../components/page-shell";
import { describeError } from "../lib/api-request";
import {
  canAdminister,
  createInvitation,
  fetchInvitations,
  fetchMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "../lib/organizations";
import type { IssuedInvitation, MembershipRole } from "../lib/organizations";
import { useResource } from "../lib/use-resource";
import { MembersScreen } from "../screens/members/members-screen";

export const Route = createFileRoute("/orgs/$orgSlug/members")({
  staticData: { breadcrumb: "Members" },
  component: Members,
});

function Members() {
  const { orgSlug } = Route.useParams();
  const { organization, session } = Route.useRouteContext();
  const [githubLogin, setGithubLogin] = useState("");
  const [role, setRole] = useState<MembershipRole>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [issued, setIssued] = useState<IssuedInvitation | undefined>(undefined);

  const administers = canAdminister(organization.role);
  const ownsOrganization = organization.role === "OWNER";

  // Only an owner or admin may read the invitation list, so a member loads
  // just the roster rather than being shown a failure they cannot act on.
  const { reload, state } = useResource(
    async ({ signal }) => {
      const [members, invitations] = await Promise.all([
        fetchMembers(orgSlug, { signal }),
        administers ? fetchInvitations(orgSlug, { signal }) : Promise.resolve([]),
      ]);
      return { invitations, members };
    },
    [administers, orgSlug],
  );

  async function invite(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (inviting || githubLogin.trim().length === 0) return;

    setInviting(true);
    setActionError(undefined);
    try {
      setIssued(await createInvitation(orgSlug, { githubLogin: githubLogin.trim(), role }));
      setGithubLogin("");
      reload();
    } catch (error) {
      setActionError(describeError(error, "Something went wrong while sending the invitation."));
    } finally {
      setInviting(false);
    }
  }

  async function act(action: () => Promise<unknown>): Promise<void> {
    setActionError(undefined);
    try {
      await action();
      reload();
    } catch (error) {
      setActionError(describeError(error, "Something went wrong while updating this member."));
    }
  }

  const members = state.status === "ready" ? state.data.members : [];
  const pending =
    state.status === "ready"
      ? state.data.invitations.filter(
          (invitation) => invitation.acceptedAt == null && invitation.revokedAt == null,
        )
      : [];

  return (
    <PageShell
      organizations={session.organizations}
      orgSlug={orgSlug}
      viewer={session.viewer ?? undefined}
    >
      <MembersScreen
        actionError={actionError}
        administers={administers}
        canGrantOwner={ownsOrganization}
        errorDescription={
          state.status === "error"
            ? describeError(state.error, "Something went wrong while loading members.")
            : undefined
        }
        githubLogin={githubLogin}
        invitations={pending}
        inviteRole={role}
        inviting={inviting}
        issued={issued}
        members={members}
        onDismissIssued={() => setIssued(undefined)}
        onGithubLoginChange={setGithubLogin}
        onInvite={(event) => void invite(event)}
        onInviteRoleChange={setRole}
        onMemberRoleChange={(userId, next) =>
          void act(() => updateMemberRole(orgSlug, userId, next))
        }
        onRemoveMember={(userId) => void act(() => removeMember(orgSlug, userId))}
        onRetry={reload}
        onRevokeInvitation={(invitationId) =>
          void act(() => revokeInvitation(orgSlug, invitationId))
        }
        status={state.status}
        viewerUserId={session.viewer?.id}
      />
    </PageShell>
  );
}
