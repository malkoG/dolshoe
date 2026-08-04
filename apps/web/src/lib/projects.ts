import { z } from "zod";

const PROJECTS_URL = "/api/v1/projects";

const projectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

const projectListResponseSchema = z.object({
  projects: z.array(projectSchema),
});

const projectTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});

const projectTokenListResponseSchema = z.object({
  tokens: z.array(projectTokenSchema),
});

const issuedProjectTokenSchema = projectTokenSchema.extend({
  token: z.string(),
});

export type Project = z.infer<typeof projectSchema>;
export type ProjectToken = z.infer<typeof projectTokenSchema>;
export type IssuedProjectToken = z.infer<typeof issuedProjectTokenSchema>;

export class ProjectsFetchError extends Error {
  readonly operation: string;
  readonly url: string;
  readonly status?: number;

  constructor(
    message: string,
    context: { operation: string; url: string; status?: number; cause?: unknown },
  ) {
    super(message, { cause: context.cause });
    this.name = "ProjectsFetchError";
    this.operation = context.operation;
    this.url = context.url;
    this.status = context.status;
  }
}

/**
 * Performs one API call and validates it against the web-owned mirror of the
 * response contract, distinguishing the four ways it can fail so a caller can
 * tell an unreachable API from a contract mismatch.
 */
async function requestJson<T>(
  operation: string,
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ProjectsFetchError(`Could not reach ${url} to ${operation}.`, {
      operation,
      url,
      cause,
    });
  }

  if (!response.ok) {
    throw new ProjectsFetchError(
      `Could not ${operation}: ${url} responded with ${response.status} ${response.statusText}.`,
      { operation, url, status: response.status },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ProjectsFetchError(`Could not ${operation}: ${url} did not return valid JSON.`, {
      operation,
      url,
      status: response.status,
      cause,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ProjectsFetchError(
      `Could not ${operation}: the response from ${url} did not match the expected contract.`,
      { operation, url, status: response.status, cause: parsed.error },
    );
  }

  return parsed.data;
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

export async function fetchProjects(init?: { signal?: AbortSignal }): Promise<Project[]> {
  const { projects } = await requestJson(
    "list projects",
    PROJECTS_URL,
    projectListResponseSchema,
    init,
  );
  return projects;
}

export function createProject(
  input: { name: string; slug?: string },
  init?: { signal?: AbortSignal },
): Promise<Project> {
  return requestJson("create the project", PROJECTS_URL, projectSchema, {
    ...jsonBody(input),
    ...init,
  });
}

export async function fetchProjectTokens(
  projectId: string,
  init?: { signal?: AbortSignal },
): Promise<ProjectToken[]> {
  const { tokens } = await requestJson(
    "list ingestion tokens",
    `${PROJECTS_URL}/${projectId}/tokens`,
    projectTokenListResponseSchema,
    init,
  );
  return tokens;
}

/**
 * Issues a token. The returned plaintext is the only copy that will ever exist:
 * the server keeps a digest, so it cannot be fetched again.
 */
export function issueProjectToken(
  projectId: string,
  input: { name: string },
  init?: { signal?: AbortSignal },
): Promise<IssuedProjectToken> {
  return requestJson(
    "issue an ingestion token",
    `${PROJECTS_URL}/${projectId}/tokens`,
    issuedProjectTokenSchema,
    { ...jsonBody(input), ...init },
  );
}

export function revokeProjectToken(
  projectId: string,
  tokenId: string,
  init?: { signal?: AbortSignal },
): Promise<ProjectToken> {
  return requestJson(
    "revoke the ingestion token",
    `${PROJECTS_URL}/${projectId}/tokens/${tokenId}/revoke`,
    projectTokenSchema,
    { method: "POST", ...init },
  );
}
