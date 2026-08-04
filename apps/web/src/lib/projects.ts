import { z } from "zod";

import { jsonBody, requestJson } from "./api-request";

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
