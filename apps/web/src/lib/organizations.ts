import { z } from "zod";

import { ApiError, jsonBody, requestJson } from "./api-request";

const ORGANIZATIONS_URL = "/api/v1/orgs";

export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export const organizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: membershipRoleSchema,
  createdAt: z.string(),
});

const organizationListResponseSchema = z.object({
  organizations: z.array(organizationSchema),
});

const memberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role: membershipRoleSchema,
  joinedAt: z.string(),
});

const memberListResponseSchema = z.object({
  members: z.array(memberSchema),
});

const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: membershipRoleSchema,
  invitedBy: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});

const invitationListResponseSchema = z.object({
  invitations: z.array(invitationSchema),
});

const issuedInvitationSchema = invitationSchema.extend({
  invitationUrl: z.string(),
});

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type IssuedInvitation = z.infer<typeof issuedInvitationSchema>;

/** Everything except reading is restricted to an owner or an admin. */
export function canAdminister(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function fetchOrganizations(init?: { signal?: AbortSignal }): Promise<Organization[]> {
  const { organizations } = await requestJson(
    "list organizations",
    ORGANIZATIONS_URL,
    organizationListResponseSchema,
    init,
  );
  return organizations;
}

export function createOrganization(
  input: { name: string; slug?: string },
  init?: { signal?: AbortSignal },
): Promise<Organization> {
  return requestJson("create the organization", ORGANIZATIONS_URL, organizationSchema, {
    ...jsonBody(input),
    ...init,
  });
}

export async function fetchMembers(
  orgSlug: string,
  init?: { signal?: AbortSignal },
): Promise<Member[]> {
  const { members } = await requestJson(
    "list members",
    `${ORGANIZATIONS_URL}/${orgSlug}/members`,
    memberListResponseSchema,
    init,
  );
  return members;
}

export function updateMemberRole(
  orgSlug: string,
  userId: string,
  role: MembershipRole,
  init?: { signal?: AbortSignal },
): Promise<Member> {
  return requestJson(
    "change the member's role",
    `${ORGANIZATIONS_URL}/${orgSlug}/members/${userId}`,
    memberSchema,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
      ...init,
    },
  );
}

/** Answers 204 with no body, so there is nothing for `requestJson` to validate. */
export async function removeMember(
  orgSlug: string,
  userId: string,
  init?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetch(`${ORGANIZATIONS_URL}/${orgSlug}/members/${userId}`, {
    method: "DELETE",
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(`Could not remove the member: the API responded with ${response.status}.`, {
      operation: "remove the member",
      url: `${ORGANIZATIONS_URL}/${orgSlug}/members/${userId}`,
      status: response.status,
    });
  }
}

export async function fetchInvitations(
  orgSlug: string,
  init?: { signal?: AbortSignal },
): Promise<Invitation[]> {
  const { invitations } = await requestJson(
    "list invitations",
    `${ORGANIZATIONS_URL}/${orgSlug}/invitations`,
    invitationListResponseSchema,
    init,
  );
  return invitations;
}

/**
 * Issues an invitation. The returned link is the only copy that will ever
 * exist: the server keeps a digest, and sends no email, so it has to be
 * delivered by hand.
 */
export function createInvitation(
  orgSlug: string,
  input: { email: string; role: MembershipRole },
  init?: { signal?: AbortSignal },
): Promise<IssuedInvitation> {
  return requestJson(
    "invite them",
    `${ORGANIZATIONS_URL}/${orgSlug}/invitations`,
    issuedInvitationSchema,
    { ...jsonBody(input), ...init },
  );
}

export function revokeInvitation(
  orgSlug: string,
  invitationId: string,
  init?: { signal?: AbortSignal },
): Promise<Invitation> {
  return requestJson(
    "withdraw the invitation",
    `${ORGANIZATIONS_URL}/${orgSlug}/invitations/${invitationId}/revoke`,
    invitationSchema,
    { method: "POST", ...init },
  );
}

export function acceptInvitation(
  input: { token: string; name?: string; password?: string },
  init?: { signal?: AbortSignal },
): Promise<{ organizationSlug: string }> {
  return requestJson(
    "accept the invitation",
    "/api/v1/auth/invitations/accept",
    z.object({ organizationSlug: z.string() }),
    { ...jsonBody(input), ...init },
  );
}
