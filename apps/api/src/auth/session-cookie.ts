import { appConfig } from "../config/app-config";
import { readCookie } from "./cookies";

export const SESSION_COOKIE_NAME = "dolshoe_session";

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  expires?: Date;
  maxAge?: number;
}

export function readSessionCookie(header: string | undefined): string | undefined {
  return readCookie(header, SESSION_COOKIE_NAME);
}

/**
 * `HttpOnly` so a script cannot read the session even if one is injected, and
 * `SameSite=Lax` so a cross-site form post never carries it — which is most of
 * the CSRF answer, with {@link assertSameOrigin} covering the rest.
 */
export function sessionCookieOptions(expiresAt: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: appConfig.sessionCookieSecure,
    expires: expiresAt,
  };
}

export function clearedSessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: appConfig.sessionCookieSecure,
    maxAge: 0,
  };
}
