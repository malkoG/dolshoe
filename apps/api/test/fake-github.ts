import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import request from "supertest";

import { GitHubIdentity } from "../src/auth/github-identity";
import { OAUTH_STATE_COOKIE_NAME } from "../src/auth/oauth-state";
import { SESSION_COOKIE_NAME } from "../src/auth/session-cookie";

export const AUTHORIZE_ORIGIN = "https://github.test/login/oauth/authorize";

/** A distinct GitHub account, unique enough to share a database between suites. */
export function identity(overrides: Partial<GitHubIdentity> = {}): GitHubIdentity {
  const suffix = randomUUID().slice(0, 8);

  return {
    githubUserId: `id-${suffix}`,
    githubLogin: `octocat-${suffix}`,
    name: "The Octocat",
    email: `octocat-${suffix}@example.com`,
    avatarUrl: undefined,
    ...overrides,
  };
}

/**
 * Stands in for GitHub.
 *
 * @remarks
 * The provider is replaced rather than the network stubbed, because what these
 * suites are about is what Dolshoe does with an identity — the allowlist, the
 * claim, the invitation — not how the three HTTP calls that produce one are
 * shaped. Those are pinned by `github-identity.spec.ts` against real payloads.
 */
export class FakeGitHub {
  configuration: { clientId: string; clientSecret: string; callbackUrl: string } | undefined =
    defaultConfiguration();

  /** Who the next callback resolves to. */
  next: GitHubIdentity = identity();

  authorizationUrl(state: string): string {
    return `${AUTHORIZE_ORIGIN}?state=${state}`;
  }

  exchangeCode(): Promise<string> {
    return Promise.resolve("access-token");
  }

  fetchIdentity(): Promise<GitHubIdentity> {
    return Promise.resolve(this.next);
  }

  reset(): void {
    this.configuration = defaultConfiguration();
  }
}

function defaultConfiguration() {
  return {
    clientId: "client",
    clientSecret: "secret",
    callbackUrl: "https://dolshoe.test/api/v1/auth/github/callback",
  };
}

export function cookieValue(header: string[], name: string): string | undefined {
  const set = header.find((entry) => entry.startsWith(`${name}=`));
  return set?.slice(name.length + 1).split(";")[0];
}

export interface CompletedSignIn {
  readonly location: string;
  readonly sessionCookie: string | undefined;
}

/**
 * Walks the whole redirect flow the way a browser does: start, carry the state
 * cookie across to GitHub's answer, come back.
 *
 * @remarks
 * Driven end to end rather than by calling the callback directly, because the
 * state cookie is the flow's only CSRF defence and a test that skipped the start
 * would not notice it going missing.
 */
export async function signInWithGitHub(
  app: INestApplication,
  github: FakeGitHub,
  who: GitHubIdentity,
  options: { invitation?: string; redirect?: string } = {},
): Promise<CompletedSignIn> {
  github.next = who;

  const parameters = new URLSearchParams();
  if (options.redirect != null) parameters.set("redirect", options.redirect);
  if (options.invitation != null) parameters.set("invitation", options.invitation);

  const started = await request(app.getHttpServer())
    .get(`/api/v1/auth/github/start?${parameters.toString()}`)
    .expect(302);

  const state = cookieValue(started.get("Set-Cookie") ?? [], OAUTH_STATE_COOKIE_NAME);
  const nonce = new URL(started.get("Location") ?? "").searchParams.get("state");

  const returned = await request(app.getHttpServer())
    .get(`/api/v1/auth/github/callback?code=code&state=${nonce ?? ""}`)
    .set("cookie", `${OAUTH_STATE_COOKIE_NAME}=${state ?? ""}`)
    .expect(302);

  return {
    location: returned.get("Location") ?? "",
    sessionCookie: cookieValue(returned.get("Set-Cookie") ?? [], SESSION_COOKIE_NAME),
  };
}
