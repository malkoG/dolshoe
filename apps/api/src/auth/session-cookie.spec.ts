import { appConfig } from "../config/app-config";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
  readSessionCookie,
  sessionCookieOptions,
} from "./session-cookie";

const TOKEN = `dsv_0123456789ab_${"a".repeat(43)}`;

function setCookieSecure(value: boolean): void {
  Object.defineProperty(appConfig, "sessionCookieSecure", { configurable: true, value });
}

describe("readSessionCookie", () => {
  it("finds the session among other cookies", () => {
    const header = `theme=dark; ${SESSION_COOKIE_NAME}=${TOKEN}; locale=en`;

    expect(readSessionCookie(header)).toBe(TOKEN);
  });

  it("tolerates the spacing browsers actually send", () => {
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=${TOKEN}`)).toBe(TOKEN);
    expect(readSessionCookie(`  ${SESSION_COOKIE_NAME}=${TOKEN}  `)).toBe(TOKEN);
  });

  it("is not fooled by a cookie whose name merely starts the same", () => {
    const header = `${SESSION_COOKIE_NAME}_other=decoy; ${SESSION_COOKIE_NAME}=${TOKEN}`;

    expect(readSessionCookie(header)).toBe(TOKEN);
  });

  it("does not match a cookie whose name merely ends the same", () => {
    expect(readSessionCookie(`other_${SESSION_COOKIE_NAME}=decoy`)).toBeUndefined();
  });

  it.each([
    ["no header at all", undefined],
    ["an empty header", ""],
    ["only other cookies", "theme=dark; locale=en"],
    ["a valueless fragment", "flag"],
  ])("returns undefined for %s", (_description, header) => {
    expect(readSessionCookie(header)).toBeUndefined();
  });
});

describe("sessionCookieOptions", () => {
  it("keeps the session out of scripts and off cross-site writes", () => {
    setCookieSecure(false);
    const expiresAt = new Date("2026-09-01T00:00:00.000Z");

    expect(sessionCookieOptions(expiresAt)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      expires: expiresAt,
    });
  });

  it("follows the configured secure flag", () => {
    setCookieSecure(true);

    expect(sessionCookieOptions(new Date()).secure).toBe(true);
    expect(clearedSessionCookieOptions().secure).toBe(true);
  });
});

describe("clearedSessionCookieOptions", () => {
  it("expires the cookie immediately", () => {
    setCookieSecure(false);

    expect(clearedSessionCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 0,
    });
  });
});
