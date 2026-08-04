import { z } from "zod";

import { organizationSchema } from "../organizations/organization.contract";
import { MAXIMUM_MOCK_LOGIN_LENGTH, MOCK_LOGIN_PATTERN } from "./mock-login";

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
    mockLoginAvailable: z.boolean().meta({
      description:
        "True only on an instance running with MOCK_LOGIN, where anyone can sign in as a login they type. Never true in production, which refuses to start with it set.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "SessionResponseV1",
    description:
      "Who the caller is, whether this instance has been claimed, and whether it can sign anybody in. Answers with 200 whether or not anyone is signed in: not being signed in is a normal state, not an error.",
  });

export const mockLoginRequestSchema = z
  .object({
    login: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(MAXIMUM_MOCK_LOGIN_LENGTH)
      .regex(MOCK_LOGIN_PATTERN, "A login is alphanumerics and single inner hyphens, as GitHub's.")
      .meta({
        description: "The GitHub login to sign in as. Fabricated on the spot, verified by nothing.",
      }),
    invitation: z
      .string()
      .max(200)
      .optional()
      .meta({ description: "An invitation token, when the sign-in started from an invitation." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "MockLoginRequestV1",
    description:
      "Who to pretend to be, on an instance running with MOCK_LOGIN. Development only: no such instance may run in production.",
  });

export const mockLoginResponseSchema = z
  .object({
    viewer: viewerSchema.meta({ description: "The account that was signed in." }),
    organizationSlug: z.string().nullable().meta({
      description:
        "The organization an invitation put this account in, or null when no invitation was spent. Where the browser should land.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "MockLoginResponseV1",
    description: "The account a mock sign-in established, and where to send the browser next.",
  });

export type Viewer = z.infer<typeof viewerSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type MockLoginRequest = z.infer<typeof mockLoginRequestSchema>;
export type MockLoginResponse = z.infer<typeof mockLoginResponseSchema>;

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
