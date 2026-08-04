import { z } from "zod";

import { organizationSchema } from "../organizations/organization.contract";

const contractRegistry = z.registry<{ id?: string; description?: string }>();

const nonEmptyText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

export const viewerSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned account identifier." }),
    email: z.email().meta({
      description:
        "The account's address, taken from GitHub. Display and account-adoption data only: nothing authenticates on it.",
    }),
    name: nonEmptyText(200).meta({ description: "Human-readable account name." }),
    githubLogin: z.string().max(39).nullable().meta({
      description:
        "The GitHub account this signs in as. Null only for an account created before GitHub sign-in existed and not yet adopted.",
    }),
    avatarUrl: z
      .string()
      .max(500)
      .nullable()
      .meta({ description: "The GitHub avatar, when the account has one." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ViewerV1",
    description: "A signed-in account, as it describes itself back to the browser.",
  });

export const sessionResponseSchema = z
  .object({
    viewer: viewerSchema
      .nullable()
      .meta({ description: "The signed-in account, or null when nobody is signed in." }),
    organizations: z.array(organizationSchema).meta({
      description:
        "Newest-first organizations the viewer belongs to, with their role in each. Empty when nobody is signed in.",
    }),
    instanceClaimed: z.boolean().meta({
      description:
        "False while this instance has no accounts at all, which is the only time signing in with GitHub also claims it.",
    }),
    githubSignInConfigured: z.boolean().meta({
      description:
        "False when this instance has no GitHub OAuth app configured, which means nobody can sign in at all. The sign-in page says so rather than offering a button that cannot work.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "SessionResponseV1",
    description:
      "Who the caller is, whether this instance has been claimed, and whether it can sign anybody in. Answers with 200 whether or not anyone is signed in: not being signed in is a normal state, not an error.",
  });

export type Viewer = z.infer<typeof viewerSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

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

export const authOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
