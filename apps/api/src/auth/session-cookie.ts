import { appConfig } from "../config/app-config";

export const SESSION_COOKIE_NAME = "dolshoe_session";

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  expires?: Date;
  maxAge?: number;
}

/**
 * Reads the session cookie out of a raw `Cookie` header.
 *
 * @remarks
 * Hand-parsed rather than pulling in `cookie-parser`: exactly one cookie matters
 * to this application, and a dependency plus global middleware to find it would
 * be more moving parts than the ten lines it takes. Splits on `;` and matches
 * the full name so a cookie such as `dolshoe_session_other` cannot be mistaken
 * for this one.
 */
export function readSessionCookie(header: string | undefined): string | undefined {
  if (header == null) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
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
