import { z } from "zod";

import { PROJECT_SLUG_PATTERN } from "./project-slug";

const contractRegistry = z.registry<{ id?: string; description?: string }>();

const nonEmptyText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

const projectSlug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(PROJECT_SLUG_PATTERN, "A slug is lowercase alphanumeric segments joined by hyphens.");

/**
 * Identifies a project from another resource, such as an error report summary.
 * Deliberately unregistered so it inlines wherever it is referenced instead of
 * adding a shared component that readers have to follow.
 */
export const projectReferenceSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned project identifier." }),
    slug: projectSlug.meta({ description: "URL-safe project identifier." }),
    name: nonEmptyText(200).meta({ description: "Human-readable project name." }),
  })
  .strict();

export const projectSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned project identifier." }),
    slug: projectSlug.meta({ description: "URL-safe project identifier." }),
    name: nonEmptyText(200).meta({ description: "Human-readable project name." }),
    createdAt: z.iso.datetime().meta({ description: "UTC timestamp the project was created." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ProjectV1",
    description:
      "A project: the unit that owns ingestion tokens and the events reported with them.",
  });

export const projectListResponseSchema = z
  .object({
    projects: z.array(projectSchema).meta({ description: "Newest-first projects." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ProjectListResponseV1",
    description: "Newest-first list of projects.",
  });

export const createProjectRequestSchema = z
  .object({
    name: nonEmptyText(200).meta({ description: "Human-readable project name." }),
    slug: projectSlug
      .optional()
      .meta({ description: "URL-safe identifier. Derived from the name when omitted." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "CreateProjectRequestV1",
    description: "Creates a project.",
  });

export const projectTokenSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned token identifier." }),
    name: nonEmptyText(200).meta({ description: "Operator-supplied label for this token." }),
    prefix: z.string().meta({
      description: "The token's public prefix. Identifies a token in a list without revealing it.",
    }),
    createdAt: z.iso.datetime().meta({ description: "UTC timestamp the token was issued." }),
    lastUsedAt: z.iso.datetime().nullable().meta({
      description:
        "UTC timestamp the token last authenticated an ingest, refreshed at most once a minute.",
    }),
    revokedAt: z.iso
      .datetime()
      .nullable()
      .meta({ description: "UTC timestamp the token was revoked, or null while it is usable." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ProjectTokenV1",
    description:
      "An issued ingestion token. Never carries the token itself: only its SHA-256 digest is stored.",
  });

export const projectTokenListResponseSchema = z
  .object({
    tokens: z.array(projectTokenSchema).meta({ description: "Newest-first tokens." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ProjectTokenListResponseV1",
    description: "Newest-first list of a project's ingestion tokens.",
  });

export const issueProjectTokenRequestSchema = z
  .object({
    name: nonEmptyText(200).meta({
      description: "Label describing where this token will be used, such as 'production'.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "IssueProjectTokenRequestV1",
    description: "Issues an ingestion token for a project.",
  });

export const issuedProjectTokenSchema = projectTokenSchema
  .extend({
    token: z.string().meta({
      description:
        "The ingestion token in plaintext. Returned exactly once, by this response only: the server stores just a SHA-256 digest and cannot show it again.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "IssuedProjectTokenV1",
    description: "A newly issued ingestion token, including its one-time plaintext value.",
  });

export const projectIdParamSchema = z.uuid("A project id is a UUID.");

export type ProjectReference = z.infer<typeof projectReferenceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type ProjectToken = z.infer<typeof projectTokenSchema>;
export type ProjectTokenListResponse = z.infer<typeof projectTokenListResponseSchema>;
export type IssueProjectTokenRequest = z.infer<typeof issueProjectTokenRequestSchema>;
export type IssuedProjectToken = z.infer<typeof issuedProjectTokenSchema>;

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

export const projectOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
