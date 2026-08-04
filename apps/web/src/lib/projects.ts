import { z } from "zod";

import { jsonBody, requestJson } from "./api-request";

/** Management lives under the organization; only ingestion keeps a flat path. */
function projectsUrl(orgSlug: string): string {
  return `/api/v1/orgs/${orgSlug}/projects`;
}

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

export async function fetchProjects(
  orgSlug: string,
  init?: { signal?: AbortSignal },
): Promise<Project[]> {
  const { projects } = await requestJson(
    "list projects",
    projectsUrl(orgSlug),
    projectListResponseSchema,
    init,
  );
  return projects;
}

export function createProject(
  orgSlug: string,
  input: { name: string; slug?: string },
  init?: { signal?: AbortSignal },
): Promise<Project> {
  return requestJson("create the project", projectsUrl(orgSlug), projectSchema, {
    ...jsonBody(input),
    ...init,
  });
}

export async function fetchProjectTokens(
  orgSlug: string,
  projectId: string,
  init?: { signal?: AbortSignal },
): Promise<ProjectToken[]> {
  const { tokens } = await requestJson(
    "list ingestion tokens",
    `${projectsUrl(orgSlug)}/${projectId}/tokens`,
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
  orgSlug: string,
  projectId: string,
  input: { name: string },
  init?: { signal?: AbortSignal },
): Promise<IssuedProjectToken> {
  return requestJson(
    "issue an ingestion token",
    `${projectsUrl(orgSlug)}/${projectId}/tokens`,
    issuedProjectTokenSchema,
    { ...jsonBody(input), ...init },
  );
}

export function revokeProjectToken(
  orgSlug: string,
  projectId: string,
  tokenId: string,
  init?: { signal?: AbortSignal },
): Promise<ProjectToken> {
  return requestJson(
    "revoke the ingestion token",
    `${projectsUrl(orgSlug)}/${projectId}/tokens/${tokenId}/revoke`,
    projectTokenSchema,
    { method: "POST", ...init },
  );
}
