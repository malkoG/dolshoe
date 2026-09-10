import type { Invitation, IssuedInvitation, Member } from "../../lib/organizations";
import type { MembersReviewState } from "./members-review";
import type { MembersScreenProps } from "./members-screen";

/**
 * Named states for the Members screen.
 *
 * @remarks
 * The four Figma frames on "14 — Screen / Org · Members": populated, the
 * invitation-link dialog, compact at 1024 (long name truncates), and mobile
 * at 400 (invite and rows wrap). Each state wraps the public view in the
 * private TopBar chrome so a silhouette shows Acme Payments / Members.
 *
 * `chrome.className` on compact and mobile is the width those frames
 * constrain to after the sidebar — the harness photographs chrome + view,
 * not PageShell.
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

const DESKTOP_CHROME = {
  orgName: "Acme Payments",
  variant: "desktop",
  viewerInitials: "KW",
} as const;

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

function populated(): MembersReviewState {
  return { chrome: { ...DESKTOP_CHROME }, screen: adminRoster() };
}

/**
 * The link was just issued. The dialog is the only copy that will ever exist.
 */
function invitationLink(): MembersReviewState {
  return { chrome: { ...DESKTOP_CHROME }, screen: { ...adminRoster(), issued: ISSUED } };
}

/**
 * 1024 viewport after the sidebar: a long name has to truncate rather than
 * push the role controls off the row.
 */
function compact(): MembersReviewState {
  return {
    chrome: { ...DESKTOP_CHROME, className: "w-[768px]" },
    screen: {
      ...adminRoster(),
      members: [KODING_WARRIOR, MINA_PARK, JONAH_REYES, ALEXANDRA, OPS_BOT],
    },
  };
}

/**
 * 400 viewport: the invite fields stack and each row's Right cluster wraps
 * under the name, the way MemberRow's 240px Left minimum is meant to.
 */
function mobile(): MembersReviewState {
  return {
    chrome: {
      orgName: "Acme Payments",
      variant: "mobile",
      className: "w-[400px]",
      viewerInitials: "KW",
    },
    screen: adminRoster(),
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
