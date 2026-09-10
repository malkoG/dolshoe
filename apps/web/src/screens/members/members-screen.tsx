import { DataState } from "@dolshoe/ui/components/data-state";
import { ListRow } from "@dolshoe/ui/components/list-row";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { cn } from "@dolshoe/ui/lib/utils";
import { Plus } from "lucide-react";
import type { FormEvent } from "react";

import { dateFormatter, pluralize } from "../../lib/format";
import type { Invitation, IssuedInvitation, Member, MembershipRole } from "../../lib/organizations";
import { InvitationRevealDialog } from "./invitation-reveal-dialog";
import { InvitationRow } from "./invitation-row";
import { MemberRow } from "./member-row";
import { RoleSelect } from "./role-select";

export type MembersScreenStatus = "loading" | "error" | "ready";

/**
 * The Members public view.
 *
 * @remarks
 * Values in, commands out. The route is the composition root that knows
 * about session cookies and `fetch`. A construction test and a silhouette
 * are the other one: they inject a named state instead.
 */
export interface MembersScreenProps {
  actionError?: string;
  administers: boolean;
  canGrantOwner: boolean;
  className?: string;
  errorDescription?: string;
  githubLogin: string;
  invitationOrigin?: string;
  invitations: Invitation[];
  inviteRole: MembershipRole;
  inviting?: boolean;
  issued?: IssuedInvitation;
  members: Member[];
  onDismissIssued?: () => void;
  onGithubLoginChange?: (value: string) => void;
  onInvite?: (event: FormEvent) => void;
  onInviteRoleChange?: (role: MembershipRole) => void;
  onMemberRoleChange?: (userId: string, role: MembershipRole) => void;
  onRemoveMember?: (userId: string) => void;
  onRetry?: () => void;
  onRevokeInvitation?: (invitationId: string) => void;
  status: MembersScreenStatus;
  viewerUserId?: string;
}

function memberHandle(member: Member): string {
  return member.githubLogin == null ? member.email : `@${member.githubLogin}`;
}

export function MembersScreen({
  actionError,
  administers,
  canGrantOwner,
  className,
  errorDescription,
  githubLogin,
  invitationOrigin,
  invitations,
  inviteRole,
  inviting = false,
  issued,
  members,
  onDismissIssued,
  onGithubLoginChange,
  onInvite,
  onInviteRoleChange,
  onMemberRoleChange,
  onRemoveMember,
  onRetry,
  onRevokeInvitation,
  status,
  viewerUserId,
}: MembersScreenProps) {
  function submitInvite(event: FormEvent): void {
    event.preventDefault();
    onInvite?.(event);
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <PageHeading
        className="mb-0"
        description="Who can read this organization's projects, and who can change them."
      >
        Members
      </PageHeading>

      {issued != null && (
        <InvitationRevealDialog
          invitationOrigin={invitationOrigin}
          issued={issued}
          onDismiss={onDismissIssued}
        />
      )}

      {administers && (
        <Panel>
          <form className="flex flex-wrap items-end gap-3 p-6" onSubmit={submitInvite}>
            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <Label className="text-[12px] font-semibold" htmlFor="invite-login">
                Invite a GitHub account
              </Label>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full sm:max-w-[260px]"
                id="invite-login"
                onChange={(event) => onGithubLoginChange?.(event.target.value)}
                placeholder="octocat"
                spellCheck={false}
                type="text"
                value={githubLogin}
              />
              <span className="text-[12px] text-faint">
                The handle, without the @. Only that account can redeem the link.
              </span>
            </div>

            <div className="flex min-w-[140px] flex-col gap-1 sm:min-w-[130px] sm:flex-none">
              {/* Not a <label for>: the trigger is a button, which nothing labels. */}
              <span className="text-[12px] font-semibold">Role</span>
              <RoleSelect
                ariaLabel="Role"
                canGrantOwner={canGrantOwner}
                className="w-full sm:w-[130px]"
                onValueChange={onInviteRoleChange}
                value={inviteRole}
              />
            </div>

            <Button disabled={inviting} type="submit">
              {inviting ? <Spinner /> : <Plus />}
              Invite
            </Button>
          </form>
        </Panel>
      )}

      {actionError != null && (
        <p
          className="rounded-md border border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <Panel>
        <div aria-live="polite">
          {status === "loading" && <DataState kind="loading" title="Loading members…" />}

          {status === "error" && (
            <DataState
              description={errorDescription ?? "Something went wrong while loading members."}
              kind="error"
              onRetry={onRetry}
              title="Could not load members"
            />
          )}

          {status === "ready" && (
            <>
              <PanelBar>
                <PanelSummary>{pluralize(members.length, "member")}</PanelSummary>
              </PanelBar>
              <ul>
                {members.map((member) => (
                  <ListRow key={member.userId}>
                    <MemberRow
                      canAdminister={administers}
                      canGrantOwner={canGrantOwner}
                      handle={memberHandle(member)}
                      isSelf={member.userId === viewerUserId}
                      joinedLabel={`Joined ${dateFormatter.format(new Date(member.joinedAt))}`}
                      name={member.name}
                      onRemove={() => onRemoveMember?.(member.userId)}
                      onRoleChange={(role) => onMemberRoleChange?.(member.userId, role)}
                      role={member.role}
                    />
                  </ListRow>
                ))}
              </ul>
            </>
          )}
        </div>
      </Panel>

      {administers && invitations.length > 0 && (
        <Panel>
          <PanelBar>
            <PanelSummary>
              {pluralize(invitations.length, "outstanding invitation", "outstanding invitations")}
            </PanelSummary>
          </PanelBar>
          <ul>
            {invitations.map((invitation) => (
              <ListRow key={invitation.id}>
                <InvitationRow
                  expiresLabel={`Expires ${dateFormatter.format(new Date(invitation.expiresAt))}`}
                  invitedBy={`Invited by ${invitation.invitedBy}`}
                  login={`@${invitation.githubLogin}`}
                  onWithdraw={() => onRevokeInvitation?.(invitation.id)}
                  role={invitation.role}
                />
              </ListRow>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
