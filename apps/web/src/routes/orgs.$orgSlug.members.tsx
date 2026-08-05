import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { SecretField } from "@dolshoe/ui/components/secret-field";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dolshoe/ui/components/ui/dialog";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";

import { PageShell } from "../components/page-shell";
import { describeError } from "../lib/api-request";
import { dateFormatter, pluralize } from "../lib/format";
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

export const Route = createFileRoute("/orgs/$orgSlug/members")({ component: Members });

const ROLES: MembershipRole[] = ["OWNER", "ADMIN", "MEMBER"];

/** The link exists once. Copying it is the whole delivery mechanism. */
function InvitationRevealDialog({
  issued,
  onDismiss,
}: Readonly<{ issued: IssuedInvitation; onDismiss: () => void }>) {
  const link = `${globalThis.location?.origin ?? ""}${issued.invitationUrl}`;

  return (
    <Dialog onOpenChange={(open) => !open && onDismiss()} open>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Send this link to @{issued.githubLogin}</DialogTitle>
          <DialogDescription>
            Dolshoe does not send email, and stores only a hash of this link, so it cannot show it
            to you again. It expires {dateFormatter.format(new Date(issued.expiresAt))}.
          </DialogDescription>
        </DialogHeader>

        <SecretField copyLabel="Copy link" label="Invitation" value={link} />

        <DialogFooter>
          <Button onClick={onDismiss} type="button">
            I've sent it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The role picker, filtered to what the current viewer may actually grant. */
function RoleSelect({
  ariaLabel,
  canGrantOwner,
  onValueChange,
  value,
}: Readonly<{
  ariaLabel: string;
  canGrantOwner: boolean;
  onValueChange: (role: MembershipRole) => void;
  value: MembershipRole;
}>) {
  return (
    <Select onValueChange={(next) => onValueChange(next as MembershipRole)} value={value}>
      <SelectTrigger aria-label={ariaLabel} className="w-[130px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.filter((candidate) => candidate !== "OWNER" || canGrantOwner).map((candidate) => (
          <SelectItem key={candidate} value={candidate}>
            {candidate.toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
      <PageHeading
        description="Who can read this organization's projects, and who can change them."
        eyebrow={organization.slug}
      >
        Members
      </PageHeading>

      {issued && <InvitationRevealDialog issued={issued} onDismiss={() => setIssued(undefined)} />}

      {administers && (
        <Panel className="mb-4">
          <form
            className="flex flex-wrap items-end gap-3 p-5"
            onSubmit={(event) => void invite(event)}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="invite-login">Invite a GitHub account</Label>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                id="invite-login"
                onChange={(event) => setGithubLogin(event.target.value)}
                placeholder="octocat"
                spellCheck={false}
                type="text"
                value={githubLogin}
              />
              <span className="text-[11px] text-muted-foreground">
                The handle, without the @. Only that account can redeem the link.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {/* Not a <label for>: the trigger is a button, which nothing labels. */}
              <span className="text-sm font-medium">Role</span>
              <RoleSelect
                ariaLabel="Role"
                canGrantOwner={ownsOrganization}
                onValueChange={setRole}
                value={role}
              />
            </div>

            <Button className="mb-px" disabled={inviting} type="submit">
              {inviting ? <Spinner /> : <UserPlus />}
              Invite
            </Button>
          </form>
        </Panel>
      )}

      {actionError != null && (
        <p
          className="mb-4 rounded-md border border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <Panel>
        <div aria-live="polite">
          {state.status === "loading" && <DataState kind="loading" title="Loading members…" />}

          {state.status === "error" && (
            <DataState
              kind="error"
              title="Could not load members"
              description={describeError(
                state.error,
                "Something went wrong while loading members.",
              )}
              onRetry={reload}
            />
          )}

          {state.status === "ready" &&
            members.map((member) => (
              <div
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0"
                key={member.userId}
              >
                <div className="min-w-0">
                  <strong className="block truncate text-[13px] font-bold">{member.name}</strong>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {member.githubLogin == null ? member.email : `@${member.githubLogin}`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>Joined {dateFormatter.format(new Date(member.joinedAt))}</span>
                  {administers && member.userId !== session.viewer?.id ? (
                    <>
                      <RoleSelect
                        ariaLabel={`Role for ${member.name}`}
                        canGrantOwner={ownsOrganization}
                        onValueChange={(next) =>
                          void act(() => updateMemberRole(orgSlug, member.userId, next))
                        }
                        value={member.role}
                      />
                      <Button
                        onClick={() => void act(() => removeMember(orgSlug, member.userId))}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <StatusBadge>{member.role.toLowerCase()}</StatusBadge>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Panel>

      {administers && pending.length > 0 && (
        <Panel className="mt-4">
          <PanelBar>
            <PanelSummary>
              {pluralize(pending.length, "outstanding invitation", "outstanding invitations")}
            </PanelSummary>
          </PanelBar>

          {pending.map((invitation) => (
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0"
              key={invitation.id}
            >
              <div className="min-w-0">
                <strong className="block truncate text-[13px] font-bold">
                  @{invitation.githubLogin}
                </strong>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Invited by {invitation.invitedBy}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <StatusBadge>{invitation.role.toLowerCase()}</StatusBadge>
                <span>Expires {dateFormatter.format(new Date(invitation.expiresAt))}</span>
                <Button
                  onClick={() => void act(() => revokeInvitation(orgSlug, invitation.id))}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Withdraw
                </Button>
              </div>
            </div>
          ))}
        </Panel>
      )}
    </PageShell>
  );
}
