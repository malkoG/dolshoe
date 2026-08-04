import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check, Copy, Loader2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { PageShell } from "../components/page-shell";
import { ApiError } from "../lib/api-request";
import { dateFormatter } from "../lib/format";
import {
  canAdminister,
  createInvitation,
  fetchInvitations,
  fetchMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "../lib/organizations";
import type { Invitation, IssuedInvitation, Member, MembershipRole } from "../lib/organizations";

export const Route = createFileRoute("/orgs/$orgSlug/members")({ component: Members });

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; members: Member[]; invitations: Invitation[] };

const ROLES: MembershipRole[] = ["OWNER", "ADMIN", "MEMBER"];

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading members.";
}

/** The link exists once. Copying it is the whole delivery mechanism. */
function InvitationReveal({
  issued,
  onDismiss,
}: Readonly<{ issued: IssuedInvitation; onDismiss: () => void }>) {
  const [copied, setCopied] = useState(false);
  const link = `${globalThis.location?.origin ?? ""}${issued.invitationUrl}`;

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // The Clipboard API is unavailable on insecure origins, which a
      // self-hosted instance over plain HTTP genuinely is. The link is on
      // screen either way.
    }
  }

  return (
    <div className="token-reveal" role="alert">
      <div className="token-reveal-heading">
        <UserPlus size={16} />
        <strong>Send this link to {issued.email}</strong>
      </div>
      <p>
        Dolshoe does not send email, and stores only a hash of this link, so it cannot show it to
        you again. It expires {dateFormatter.format(new Date(issued.expiresAt))}.
      </p>

      <label className="token-field">
        <span>Invitation</span>
        <code className="token-value">{link}</code>
        <button className="copy-button" onClick={() => void copy()} type="button">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </label>

      <button className="primary-button" onClick={onDismiss} type="button">
        I've sent it
      </button>
    </div>
  );
}

function Members() {
  const { orgSlug } = Route.useParams();
  const { organization, session } = Route.useRouteContext();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MembershipRole>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [issued, setIssued] = useState<IssuedInvitation | undefined>(undefined);

  const administers = canAdminister(organization.role);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    // Only an owner or admin may read the invitation list, so a member loads
    // just the roster rather than being shown a failure they cannot act on.
    Promise.all([
      fetchMembers(orgSlug, { signal: controller.signal }),
      administers ? fetchInvitations(orgSlug, { signal: controller.signal }) : Promise.resolve([]),
    ])
      .then(([members, invitations]) => {
        if (!cancelled) setState({ status: "ready", members, invitations });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [administers, orgSlug, reloadToken]);

  async function invite(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (inviting || email.trim().length === 0) return;

    setInviting(true);
    setActionError(undefined);
    try {
      setIssued(await createInvitation(orgSlug, { email: email.trim(), role }));
      setEmail("");
      setReloadToken((token) => token + 1);
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setInviting(false);
    }
  }

  async function act(action: () => Promise<unknown>): Promise<void> {
    setActionError(undefined);
    try {
      await action();
      setReloadToken((token) => token + 1);
    } catch (error) {
      setActionError(describeError(error));
    }
  }

  const members = state.status === "ready" ? state.members : [];
  const pending =
    state.status === "ready"
      ? state.invitations.filter(
          (invitation) => invitation.acceptedAt == null && invitation.revokedAt == null,
        )
      : [];

  return (
    <PageShell
      organizations={session.organizations}
      orgSlug={orgSlug}
      viewer={session.viewer ?? undefined}
    >
      <section className="page-heading">
        <div>
          <div className="eyebrow">{organization.slug}</div>
          <h1>Members</h1>
          <p>Who can read this organization's projects, and who can change them.</p>
        </div>
      </section>

      {issued && <InvitationReveal issued={issued} onDismiss={() => setIssued(undefined)} />}

      {administers && (
        <section className="report-panel">
          <form className="inline-form" onSubmit={(event) => void invite(event)}>
            <label className="auth-field">
              <span>Invite someone</span>
              <input
                onChange={(event) => setEmail(event.target.value)}
                placeholder="colleague@example.com"
                type="email"
                value={email}
              />
            </label>
            <label className="auth-field">
              <span>Role</span>
              <select
                onChange={(event) => setRole(event.target.value as MembershipRole)}
                value={role}
              >
                {ROLES.filter(
                  (candidate) => candidate !== "OWNER" || organization.role === "OWNER",
                ).map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" disabled={inviting} type="submit">
              {inviting ? <Loader2 className="spin" size={13} /> : <UserPlus size={13} />}
              Invite
            </button>
          </form>
        </section>
      )}

      {actionError != null && (
        <p className="field-error" role="alert">
          {actionError}
        </p>
      )}

      <section className="report-panel">
        {state.status === "loading" && (
          <div className="state-panel state-panel-loading" role="status">
            <span className="state-icon">
              <Loader2 className="spin" size={19} />
            </span>
            <strong>Loading members…</strong>
          </div>
        )}

        {state.status === "error" && (
          <div className="state-panel state-panel-error" role="alert">
            <span className="state-icon">
              <AlertTriangle size={19} />
            </span>
            <strong>Could not load members</strong>
            <p>{describeError(state.error)}</p>
          </div>
        )}

        {state.status === "ready" &&
          members.map((member) => (
            <div className="member-row" key={member.userId}>
              <div>
                <strong>{member.name}</strong>
                <span className="organization-slug">{member.email}</span>
              </div>
              <div className="organization-meta">
                <span>Joined {dateFormatter.format(new Date(member.joinedAt))}</span>
                {administers && member.userId !== session.viewer?.id ? (
                  <>
                    <select
                      onChange={(event) =>
                        void act(() =>
                          updateMemberRole(
                            orgSlug,
                            member.userId,
                            event.target.value as MembershipRole,
                          ),
                        )
                      }
                      value={member.role}
                    >
                      {ROLES.filter(
                        (candidate) => candidate !== "OWNER" || organization.role === "OWNER",
                      ).map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {candidate.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <button
                      className="ghost-button"
                      onClick={() => void act(() => removeMember(orgSlug, member.userId))}
                      type="button"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="role-badge">{member.role.toLowerCase()}</span>
                )}
              </div>
            </div>
          ))}
      </section>

      {administers && pending.length > 0 && (
        <section className="report-panel">
          <div className="filter-bar">
            <span className="filter-summary">
              {pending.length} outstanding {pending.length === 1 ? "invitation" : "invitations"}
            </span>
          </div>
          {pending.map((invitation) => (
            <div className="member-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <span className="organization-slug">Invited by {invitation.invitedBy}</span>
              </div>
              <div className="organization-meta">
                <span className="role-badge">{invitation.role.toLowerCase()}</span>
                <span>Expires {dateFormatter.format(new Date(invitation.expiresAt))}</span>
                <button
                  className="ghost-button"
                  onClick={() => void act(() => revokeInvitation(orgSlug, invitation.id))}
                  type="button"
                >
                  Withdraw
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </PageShell>
  );
}
