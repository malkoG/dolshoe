import { z } from "zod";

const contractRegistry = z.registry<{ id?: string; description?: string }>();

const nonEmptyText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

/**
 * Lowercased here rather than by a case-insensitive collation in the database,
 * so the rule stays visible to the code that depends on it: two addresses
 * differing only in case are the same account.
 */
const emailAddress = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(320));

/**
 * Long rather than complicated. Composition rules push people toward predictable
 * substitutions; length is what actually costs an attacker. The cap is there
 * because scrypt hashes whatever it is given and an unbounded body should not
 * become a way to spend the server's CPU.
 */
const password = z.string().min(12).max(200);

export const viewerSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned account identifier." }),
    email: z.email().meta({ description: "The address this account signs in with." }),
    name: nonEmptyText(200).meta({ description: "Human-readable account name." }),
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
    instanceClaimed: z.boolean().meta({
      description:
        "False while this instance has no accounts at all, which is the only time registration is open.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "SessionResponseV1",
    description:
      "Who the caller is and whether this instance has been claimed. Answers with 200 whether or not anyone is signed in: not being signed in is a normal state, not an error.",
  });

export const registerRequestSchema = z
  .object({
    email: emailAddress.meta({ description: "The address this account will sign in with." }),
    name: nonEmptyText(200).meta({ description: "Human-readable account name." }),
    password: password.meta({ description: "At least 12 characters." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "RegisterRequestV1",
    description: "Claims an unclaimed instance by creating its first account.",
  });

export const loginRequestSchema = z
  .object({
    email: emailAddress.meta({ description: "The address the account signs in with." }),
    password: z.string().min(1).max(200).meta({ description: "The account's password." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "LoginRequestV1",
    description: "Signs in and sets the session cookie.",
  });

export type Viewer = z.infer<typeof viewerSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;

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
