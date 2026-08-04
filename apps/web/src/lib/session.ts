import { z } from "zod";

import { requestJson } from "./api-request";
import { organizationSchema } from "./organizations";

const AUTH_URL = "/api/v1/auth";

const viewerSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  githubLogin: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

const sessionResponseSchema = z.object({
  viewer: viewerSchema.nullable(),
  organizations: z.array(organizationSchema),
  instanceClaimed: z.boolean(),
  githubSignInConfigured: z.boolean(),
});

export type Viewer = z.infer<typeof viewerSchema>;
export type Session = z.infer<typeof sessionResponseSchema>;

/**
 * What the app assumes before the root route has answered, and what it falls
 * back to if that call fails. Treating an unreachable API as "signed out" sends
 * the visitor to a sign-in page that will also fail to load rather than to
 * application chrome full of empty panels.
 *
 * `githubSignInConfigured` is optimistic for the same reason: an instance that
 * cannot be reached is not the same as one with no OAuth app, and offering the
 * button is a better guess than telling somebody their instance is misconfigured
 * when the API simply did not answer.
 */
export const SIGNED_OUT_SESSION: Session = {
  viewer: null,
  organizations: [],
  instanceClaimed: true,
  githubSignInConfigured: true,
};

/**
 * Answers who the caller is, which organizations they belong to, whether this
 * instance has been claimed, and whether it can sign anybody in — in one call,
 * because the root route needs all of it before it can decide anything. Signing
 * out is a normal answer here, not an error, so this resolves rather than
 * throwing for an anonymous visitor.
 */
export function fetchSession(init?: { signal?: AbortSignal }): Promise<Session> {
  return requestJson("read the session", `${AUTH_URL}/session`, sessionResponseSchema, init);
}

/**
 * Where to send the browser to sign in with GitHub.
 *
 * @remarks
 * A URL to navigate to rather than something to `fetch`. The flow is a round
 * trip through github.com, so it has to be a real navigation: an XHR would
 * follow the redirect itself and land the authorization screen's HTML in a
 * response body nobody can act on.
 *
 * Both parameters are read back off the state cookie rather than trusted from
 * the callback, so nothing here can be used to redirect somebody off-site or to
 * spend an invitation they were not sent.
 */
export function githubSignInUrl(options: { redirect?: string; invitation?: string } = {}): string {
  const parameters = new URLSearchParams();

  if (options.redirect != null) parameters.set("redirect", options.redirect);
  if (options.invitation != null) parameters.set("invitation", options.invitation);

  const query = parameters.toString();
  return `${AUTH_URL}/github/start${query.length === 0 ? "" : `?${query}`}`;
}

/**
 * Ends the session server-side. Answers 204 with no body, so there is nothing to
 * validate and `requestJson` is not the right tool.
 */
export async function logout(init?: { signal?: AbortSignal }): Promise<void> {
  await fetch(`${AUTH_URL}/logout`, { method: "POST", ...init });
}
