import { randomBytes, timingSafeEqual } from "node:crypto";

import { appConfig } from "../config/app-config";
import { readCookie } from "./cookies";

export const OAUTH_STATE_COOKIE_NAME = "dolshoe_oauth_state";

/**
 * Long enough to walk through GitHub's authorization screen, short enough that
 * an abandoned attempt does not leave a usable cookie behind for the afternoon.
 */
const STATE_LIFETIME_SECONDS = 600;

const NONCE_BYTES = 32;

/**
 * What a sign-in attempt has to remember while the browser is away at GitHub.
 *
 * @remarks
 * Only the nonce goes into the `state` query parameter. The rest rides in the
 * cookie instead, so a crafted link cannot choose where somebody lands or which
 * invitation their sign-in redeems.
 */
export interface OAuthState {
  readonly nonce: string;
  /** Where to send the browser afterwards. Always a path on this site. */
  readonly redirect: string;
  /** The invitation link being redeemed, when the flow started from one. */
  readonly invitationToken?: string;
}

export interface OAuthStateCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
}

export function generateOAuthNonce(): string {
  return randomBytes(NONCE_BYTES).toString("base64url");
}

/**
 * Accepts only a path on this site, so a crafted `?redirect=` cannot bounce a
 * freshly signed-in browser somewhere else. `//evil.example` is rejected too: a
 * browser reads a protocol-relative URL as another origin.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

/**
 * `SameSite=Lax` rather than `Strict`, because the callback arrives as a
 * top-level navigation from github.com and `Strict` would withhold the cookie
 * on exactly the request that needs it.
 */
export function oauthStateCookieOptions(): OAuthStateCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: appConfig.sessionCookieSecure,
    maxAge: STATE_LIFETIME_SECONDS * 1_000,
  };
}

export function clearedOAuthStateCookieOptions(): OAuthStateCookieOptions {
  return { ...oauthStateCookieOptions(), maxAge: 0 };
}

export function readOAuthStateCookie(header: string | undefined): string | undefined {
  return readCookie(header, OAUTH_STATE_COOKIE_NAME);
}

export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

/**
 * Returns `undefined` for anything this module did not write. The caller treats
 * that the same as a missing cookie: the flow cannot be completed and has to be
 * started again.
 */
export function decodeOAuthState(encoded: string | undefined): OAuthState | undefined {
  if (encoded == null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }

  if (parsed == null || typeof parsed !== "object") return undefined;

  const { nonce, redirect, invitationToken } = parsed as Record<string, unknown>;
  if (typeof nonce !== "string" || nonce.length === 0) return undefined;

  return {
    nonce,
    // Re-checked on the way out as well as in. The cookie is ours, but a stale
    // one from before a deployment should not be trusted to still be shaped
    // the way this version expects.
    redirect: safeRedirectPath(redirect) ?? "/",
    invitationToken: typeof invitationToken === "string" ? invitationToken : undefined,
  };
}

/**
 * Constant-time comparison of the nonce GitHub echoed against the one this
 * browser was issued. Lengths differ only for a malformed value, which the
 * length check rejects before `timingSafeEqual` would throw on it.
 */
export function nonceMatches(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  if (presentedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(presentedBytes, expectedBytes);
}
