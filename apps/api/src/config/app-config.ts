import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({
  path: resolve(process.cwd(), "../../.env"),
  quiet: true,
});

/** Treats an unset variable and one set to the empty string the same way. */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/**
 * A comma-separated list of GitHub logins, lowercased because GitHub treats
 * "Octocat" and "octocat" as one account. Empty when unset, which the sign-in
 * path reads as "no allowlist" rather than "nobody is allowed".
 */
const githubLoginList = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string().transform((value) =>
    value
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter((login) => login.length > 0),
  ),
);

const environmentShape = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warning", "error", "fatal"]).default("info"),
  // Optional even in production: an instance that has migrated to per-project
  // tokens has no global token to set. The ingestion guard, not startup
  // validation, is what refuses unauthenticated production ingestion.
  INGEST_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(14),
  // Follows NODE_ENV unless set. Overridable because a self-hosted instance can
  // legitimately serve production traffic over plain HTTP on a private network,
  // where a Secure cookie would make signing in fail with nothing to show why.
  SESSION_COOKIE_SECURE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["true", "false"]).optional(),
  ),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL URL",
    ),
  // GitHub is the only way to sign in, but these stay optional so an instance
  // with them missing still boots and says so. Refusing to start would leave an
  // operator with no API through which to read the complaint, which is the same
  // reason the instance-claim warning is a log line rather than a thrown error.
  GITHUB_CLIENT_ID: optionalText(z.string().min(1)),
  GITHUB_CLIENT_SECRET: optionalText(z.string().min(1)),
  // Absolute, because GitHub redirects a browser here and has to be given
  // somewhere the browser can actually reach — not the API's internal address.
  GITHUB_CALLBACK_URL: optionalText(z.string().url()),
  GITHUB_ALLOWED_LOGINS: githubLoginList,
  // Opens a development-only door that signs anybody in as a login they type,
  // with no round trip to GitHub. Refused outright in production below.
  MOCK_LOGIN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["true", "false"]).optional(),
  ),
});

/**
 * Exported so the shipped `.env.example` can be checked against the same rules
 * the application boots with. Copying that file is the documented first step, so
 * an example that fails validation is an instance that will not start.
 */
export const environmentSchema = environmentShape
  .refine(
    (environment) => {
      const oauthApp = [
        environment.GITHUB_CLIENT_ID,
        environment.GITHUB_CLIENT_SECRET,
        environment.GITHUB_CALLBACK_URL,
      ];

      return oauthApp.every((value) => value == null) || oauthApp.every((value) => value != null);
    },
    {
      error:
        "GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL configure one OAuth app: set all three or none. A partial set fails at the redirect, long after startup.",
      path: ["GITHUB_CLIENT_ID"],
    },
  )
  // Unlike the warnings elsewhere in this codebase, this one refuses to start.
  // Those warn so an operator still has an API through which to read the
  // complaint; here the fix is deleting a line from `.env`, which needs no API,
  // and the alternative is a production instance that signs anybody in as
  // anybody. Getting that wrong quietly is worse than not booting.
  .refine(
    (environment) => !(environment.MOCK_LOGIN === "true" && environment.NODE_ENV === "production"),
    {
      error:
        "MOCK_LOGIN signs anybody in as whichever login they type, so it cannot be set in production. Unset it, or set NODE_ENV to development.",
      path: ["MOCK_LOGIN"],
    },
  );

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsedEnvironment.error)}`);
}

const environment = parsedEnvironment.data;

/**
 * Present exactly when this instance can sign anybody in. Grouped rather than
 * left as three loose optionals so the sign-in path checks one thing and then
 * has all three, instead of re-asserting each at every use.
 */
export interface GitHubOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly callbackUrl: string;
}

function readGitHubConfig(): GitHubOAuthConfig | undefined {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL } = environment;

  if (GITHUB_CLIENT_ID == null || GITHUB_CLIENT_SECRET == null || GITHUB_CALLBACK_URL == null) {
    return undefined;
  }

  return {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackUrl: GITHUB_CALLBACK_URL,
  };
}

export const appConfig = {
  nodeEnvironment: environment.NODE_ENV,
  port: environment.PORT,
  logLevel: environment.LOG_LEVEL,
  ingestToken: environment.INGEST_TOKEN,
  logRetentionDays: environment.LOG_RETENTION_DAYS,
  databaseUrl: environment.DATABASE_URL,
  sessionCookieSecure:
    environment.SESSION_COOKIE_SECURE == null
      ? environment.NODE_ENV === "production"
      : environment.SESSION_COOKIE_SECURE === "true",
  github: readGitHubConfig(),
  /**
   * Logins permitted to sign in at all, or empty for no restriction. A separate
   * gate from membership: this decides who may hold an account, invitations
   * decide which organizations that account reaches.
   */
  githubAllowedLogins: environment.GITHUB_ALLOWED_LOGINS,
  /**
   * Whether this instance offers the development-only sign-in that fabricates an
   * identity instead of asking GitHub for one. Never true in production: the
   * schema above refuses to parse that combination at all.
   */
  mockLogin: environment.MOCK_LOGIN === "true",
} as const;
