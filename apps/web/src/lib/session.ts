import { z } from "zod";

import { ApiError, jsonBody, requestJson } from "./api-request";
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
  mockLoginAvailable: z.boolean(),
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
 *
 * `mockLoginAvailable` is pessimistic, which is the opposite call for the
 * opposite reason. An unreachable API is no grounds for showing a door that
 * probably is not there, and being wrong the other way would put a development
 * affordance on a deployed instance's sign-in page.
 */
export const SIGNED_OUT_SESSION: Session = {
  viewer: null,
  organizations: [],
  instanceClaimed: true,
  githubSignInConfigured: true,
  mockLoginAvailable: false,
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

const mockSignInResponseSchema = z.object({
  viewer: viewerSchema,
  organizationSlug: z.string().nullable(),
});

export type MockSignIn = z.infer<typeof mockSignInResponseSchema>;

/**
 * A mock sign-in the instance turned down, carrying the same refusal code the
 * GitHub callback would have put in `?error=`. Separate from {@link ApiError}
 * because it is an answer rather than a failure: the instance worked exactly as
 * intended and said no.
 */
export class SignInRefused extends Error {
  constructor(readonly code: string) {
    super(`The instance refused the sign-in: ${code}.`);
    this.name = "SignInRefused";
  }
}

/**
 * Signs in as a login, on an instance running with `MOCK_LOGIN`.
 *
 * @remarks
 * Unlike {@link githubSignInUrl} this is a `fetch` rather than a navigation:
 * nothing about it leaves this origin, so there is no round trip for a browser to
 * make. The session cookie comes back on the response and the caller navigates
 * itself.
 *
 * Hand-rolled rather than sent through `requestJson`, which turns any non-2xx
 * into an `ApiError` and discards the body — and the body is the whole point of a
 * refusal here.
 */
export async function mockSignIn(options: {
  login: string;
  invitation?: string;
}): Promise<MockSignIn> {
  const url = `${AUTH_URL}/mock/session`;
  const response = await fetch(
    url,
    jsonBody({ login: options.login, invitation: options.invitation }),
  );

  if (response.status === 403) {
    const body: unknown = await response.json().catch(() => undefined);
    const code =
      typeof body === "object" && body != null && "error" in body && typeof body.error === "string"
        ? body.error
        : "state";

    throw new SignInRefused(code);
  }

  if (!response.ok) {
    throw new ApiError(
      `Could not sign in: ${url} responded with ${response.status} ${response.statusText}.`,
      { operation: "sign in", url, status: response.status },
    );
  }

  return mockSignInResponseSchema.parse(await response.json());
}

/**
 * Ends the session server-side. Answers 204 with no body, so there is nothing to
 * validate and `requestJson` is not the right tool.
 */
export async function logout(init?: { signal?: AbortSignal }): Promise<void> {
  await fetch(`${AUTH_URL}/logout`, { method: "POST", ...init });
}
