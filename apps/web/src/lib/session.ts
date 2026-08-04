import { z } from "zod";

import { jsonBody, requestJson } from "./api-request";
import { organizationSchema } from "./organizations";

const AUTH_URL = "/api/v1/auth";

const viewerSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

const sessionResponseSchema = z.object({
  viewer: viewerSchema.nullable(),
  organizations: z.array(organizationSchema),
  instanceClaimed: z.boolean(),
});

export type Viewer = z.infer<typeof viewerSchema>;
export type Session = z.infer<typeof sessionResponseSchema>;

/**
 * What the app assumes before the root route has answered, and what it falls
 * back to if that call fails. Treating an unreachable API as "signed out" sends
 * the visitor to a sign-in page that will also fail to load rather than to
 * application chrome full of empty panels.
 */
export const SIGNED_OUT_SESSION: Session = {
  viewer: null,
  organizations: [],
  instanceClaimed: true,
};

/**
 * Answers who the caller is, which organizations they belong to, and whether
 * this instance has been claimed — in one call, because the root route needs all
 * three before it can decide anything. Signing out is a normal answer here, not
 * an error, so this resolves rather than throwing for an anonymous visitor.
 */
export function fetchSession(init?: { signal?: AbortSignal }): Promise<Session> {
  return requestJson("read the session", `${AUTH_URL}/session`, sessionResponseSchema, init);
}

export function login(
  input: { email: string; password: string },
  init?: { signal?: AbortSignal },
): Promise<Viewer> {
  return requestJson("sign in", `${AUTH_URL}/login`, viewerSchema, {
    ...jsonBody(input),
    ...init,
  });
}

export function register(
  input: { email: string; name: string; password: string },
  init?: { signal?: AbortSignal },
): Promise<Viewer> {
  return requestJson("create the account", `${AUTH_URL}/register`, viewerSchema, {
    ...jsonBody(input),
    ...init,
  });
}

/**
 * Ends the session server-side. Answers 204 with no body, so there is nothing to
 * validate and `requestJson` is not the right tool.
 */
export async function logout(init?: { signal?: AbortSignal }): Promise<void> {
  await fetch(`${AUTH_URL}/logout`, { method: "POST", ...init });
}
