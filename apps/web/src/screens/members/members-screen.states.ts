import type { Invitation, IssuedInvitation, Member } from "../../lib/organizations";
import type { MembersScreenProps } from "./members-screen";

/**
 * Named states for the Members screen.
 *
 * @remarks
 * The four Figma frames on "14 — Screen / Org · Members": populated, the
 * invitation-link dialog, compact at 1024 (long name truncates), and mobile
 * at 400 (invite and rows wrap). Loading and error live in the view but do
 * not change a silhouette the frames did not draw.
 *
 * `className` on compact and mobile is the width those frames constrain to
 * after chrome — the harness photographs the view, not the sidebar.
 */
const VIEWER_ID = "user-kodingwarrior";

const KODING_WARRIOR: Member = {
  userId: VIEWER_ID,
  email: "koding@acme.example",
  name: "Koding Warrior",
  githubLogin: "kodingwarrior",
  role: "OWNER",
  joinedAt: "2026-08-14T00:00:00.000Z",
};

const MINA_PARK: Member = {
  userId: "user-minapark",
  email: "mina@acme.example",
  name: "Mina Park",
  githubLogin: "minapark",
  role: "ADMIN",
  joinedAt: "2026-08-20T00:00:00.000Z",
};

const JONAH_REYES: Member = {
  userId: "user-jreyes",
  email: "jonah@acme.example",
  name: "Jonah Reyes",
  githubLogin: "jreyes",
  role: "MEMBER",
  joinedAt: "2026-09-01T00:00:00.000Z",
};

const OPS_BOT: Member = {
  userId: "user-opsbot",
  email: "ops-bot@acme.example",
  name: "Ops Bot",
  githubLogin: null,
  role: "MEMBER",
  joinedAt: "2026-09-03T00:00:00.000Z",
};

const ALEXANDRA: Member = {
  userId: "user-alexandra",
  email: "alexandra@acme.example",
  name: "Alexandra Fitzgerald-Whitmore",
  githubLogin: "alexandra.fitzgerald-whitmore",
  role: "MEMBER",
  joinedAt: "2026-09-04T00:00:00.000Z",
};

const OCTOCAT_INVITE: Invitation = {
  id: "inv-octocat",
  githubLogin: "octocat",
  role: "MEMBER",
  invitedBy: "Koding Warrior",
  createdAt: "2026-09-10T00:00:00.000Z",
  expiresAt: "2026-09-17T00:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
};

const HUBOT_INVITE: Invitation = {
  id: "inv-hubot",
  githubLogin: "hubot",
  role: "ADMIN",
  invitedBy: "Mina Park",
  createdAt: "2026-09-08T00:00:00.000Z",
  expiresAt: "2026-09-15T00:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
};

const ISSUED: IssuedInvitation = {
  ...OCTOCAT_INVITE,
  invitationUrl: "/invitations/inv_9f3c2a7d1e5b4c8a6d2f0e1b",
};

const POPULATED_MEMBERS = [KODING_WARRIOR, MINA_PARK, JONAH_REYES, OPS_BOT];
const PENDING = [OCTOCAT_INVITE, HUBOT_INVITE];

function adminRoster(): MembersScreenProps {
  return {
    administers: true,
    canGrantOwner: true,
    githubLogin: "",
    invitationOrigin: "https://dolshoe.example.com",
    invitations: PENDING,
    inviteRole: "MEMBER",
    members: POPULATED_MEMBERS,
    status: "ready",
    viewerUserId: VIEWER_ID,
  };
}

function populated(): MembersScreenProps {
  return adminRoster();
}

/**
 * The link was just issued. The dialog is the only copy that will ever exist.
 */
function invitationLink(): MembersScreenProps {
  return {
    ...adminRoster(),
    issued: ISSUED,
  };
}

/**
 * 1024 viewport after the sidebar: a long name has to truncate rather than
 * push the role controls off the row.
 */
function compact(): MembersScreenProps {
  return {
    ...adminRoster(),
    className: "w-[696px]",
    members: [KODING_WARRIOR, MINA_PARK, JONAH_REYES, ALEXANDRA, OPS_BOT],
  };
}

/**
 * 400 viewport: the invite fields stack and each row's Right cluster wraps
 * under the name, the way MemberRow's 240px Left minimum is meant to.
 */
function mobile(): MembersScreenProps {
  return {
    ...adminRoster(),
    className: "w-[360px]",
  };
}

export const membersScreenStates = {
  populated,
  invitationLink,
  compact,
  mobile,
} as const;

export const membersScreenStateNames = [
  "populated",
  "invitationLink",
  "compact",
  "mobile",
] as const;

export type MembersScreenStateName = (typeof membersScreenStateNames)[number];

export function isMembersScreenStateName(value: string | null): value is MembersScreenStateName {
  return value != null && (membersScreenStateNames as readonly string[]).includes(value);
}
