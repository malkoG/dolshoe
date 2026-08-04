import { z } from "zod";

import { jsonBody, requestJson } from "./api-request";

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

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;

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
