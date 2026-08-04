import { z } from "zod";

import { PROJECT_SLUG_PATTERN } from "../projects/project-slug";

const contractRegistry = z.registry<{ id?: string; description?: string }>();

const nonEmptyText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

/**
 * Organizations and projects share a slug shape. The pattern lives with projects
 * because that is where it was first needed; it is imported rather than copied so
 * the two cannot drift into accepting different things.
 */
const organizationSlug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(PROJECT_SLUG_PATTERN, "A slug is lowercase alphanumeric segments joined by hyphens.");

export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export const organizationSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned organization identifier." }),
    slug: organizationSlug.meta({ description: "URL-safe organization identifier." }),
    name: nonEmptyText(200).meta({ description: "Human-readable organization name." }),
    role: membershipRoleSchema.meta({
      description: "The current viewer's role here. Not a property of the organization itself.",
    }),
    createdAt: z.iso
      .datetime()
      .meta({ description: "UTC timestamp the organization was created." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "OrganizationV1",
    description: "An organization: the tenant that owns projects and the events reported to them.",
  });

export const organizationListResponseSchema = z
  .object({
    organizations: z
      .array(organizationSchema)
      .meta({ description: "Newest-first organizations the viewer belongs to." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "OrganizationListResponseV1",
    description: "Newest-first list of the organizations the caller is a member of.",
  });

export const createOrganizationRequestSchema = z
  .object({
    name: nonEmptyText(200).meta({ description: "Human-readable organization name." }),
    slug: organizationSlug
      .optional()
      .meta({ description: "URL-safe identifier. Derived from the name when omitted." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "CreateOrganizationRequestV1",
    description: "Creates an organization. The creator becomes its owner.",
  });

export const memberSchema = z
  .object({
    userId: z.uuid().meta({ description: "The account this membership belongs to." }),
    email: z.email().meta({ description: "The member's address." }),
    name: nonEmptyText(200).meta({ description: "The member's name." }),
    role: membershipRoleSchema.meta({ description: "What the member may do here." }),
    joinedAt: z.iso.datetime().meta({ description: "UTC timestamp the member joined." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "MemberV1",
    description: "One person's membership of an organization.",
  });

export const memberListResponseSchema = z
  .object({
    members: z.array(memberSchema).meta({ description: "Members, oldest first." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "MemberListResponseV1",
    description: "Everyone who belongs to an organization.",
  });

export const updateMemberRequestSchema = z
  .object({
    role: membershipRoleSchema.meta({ description: "The role to give this member." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "UpdateMemberRequestV1",
    description: "Changes a member's role.",
  });

const invitationEmail = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(320));

export const invitationSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned invitation identifier." }),
    email: z.email().meta({ description: "The address this invitation was issued for." }),
    role: membershipRoleSchema.meta({ description: "The role it grants on acceptance." }),
    invitedBy: nonEmptyText(200).meta({ description: "Who issued it." }),
    createdAt: z.iso.datetime().meta({ description: "UTC timestamp it was issued." }),
    expiresAt: z.iso.datetime().meta({ description: "UTC timestamp it stops working." }),
    acceptedAt: z.iso
      .datetime()
      .nullable()
      .meta({ description: "UTC timestamp it was accepted, or null." }),
    revokedAt: z.iso
      .datetime()
      .nullable()
      .meta({ description: "UTC timestamp it was revoked, or null." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "InvitationV1",
    description:
      "An outstanding offer to join an organization. Never carries its token: only a SHA-256 digest is stored.",
  });

export const invitationListResponseSchema = z
  .object({
    invitations: z.array(invitationSchema).meta({ description: "Newest-first invitations." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "InvitationListResponseV1",
    description: "Newest-first list of an organization's invitations.",
  });

export const createInvitationRequestSchema = z
  .object({
    email: invitationEmail.meta({ description: "Who to invite." }),
    role: membershipRoleSchema.meta({ description: "The role they will hold." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "CreateInvitationRequestV1",
    description: "Invites someone to an organization.",
  });

export const issuedInvitationSchema = invitationSchema
  .extend({
    invitationUrl: z.string().meta({
      description:
        "The one-time link to send. Returned exactly once, by this response only: the server stores just a SHA-256 digest and cannot show it again. Dolshoe sends no email, so this has to be delivered by hand.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "IssuedInvitationV1",
    description: "A newly issued invitation, including its one-time link.",
  });

export const acceptInvitationRequestSchema = z
  .object({
    token: z.string().min(1).meta({ description: "The token from the invitation link." }),
    name: nonEmptyText(200)
      .optional()
      .meta({ description: "Required when accepting without being signed in." }),
    password: z
      .string()
      .min(12)
      .max(200)
      .optional()
      .meta({ description: "Required when accepting without being signed in." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "AcceptInvitationRequestV1",
    description:
      "Accepts an invitation. Signed in, it only adds the membership; signed out, it also creates the account.",
  });

export const orgSlugParamSchema = organizationSlug;
export const invitationIdParamSchema = z.uuid("An invitation id is a UUID.");
export const userIdParamSchema = z.uuid("A user id is a UUID.");

export type MembershipRoleName = z.infer<typeof membershipRoleSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationListResponse = z.infer<typeof organizationListResponseSchema>;
export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;
export type Member = z.infer<typeof memberSchema>;
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type IssuedInvitation = z.infer<typeof issuedInvitationSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

function adaptJsonSchemaToOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(adaptJsonSchemaToOpenApi);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const adapted: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (key === "$id") {
      continue;
    }

    if (key === "examples" && Array.isArray(child) && child.length > 0) {
      adapted.example = adaptJsonSchemaToOpenApi(child[0]);
      continue;
    }

    adapted[key] = adaptJsonSchemaToOpenApi(child);
  }

  return adapted;
}

const generatedSchemas = z.toJSONSchema(contractRegistry, {
  target: "openapi-3.0",
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
}).schemas;

export const organizationOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
