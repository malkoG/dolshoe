import { createHash } from "node:crypto";

import { generateProjectToken, parseProjectTokenPrefix } from "../projects/project-token";
import {
  ABSENT_SESSION_HASH,
  generateSessionToken,
  hashSessionToken,
  parseSessionTokenPrefix,
} from "./session-token";

const TOKEN_SHAPE = /^dsv_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/;

describe("generateSessionToken", () => {
  it("produces a token whose prefix and hash describe the token itself", () => {
    const token = generateSessionToken();

    expect(token.raw).toMatch(TOKEN_SHAPE);
    expect(parseSessionTokenPrefix(token.raw)).toBe(token.prefix);
    expect(token.hash).toBe(createHash("sha256").update(token.raw).digest("hex"));
    expect(token.hash).toHaveLength(64);
  });

  it("does not repeat itself", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(second.raw).not.toBe(first.raw);
    expect(second.prefix).not.toBe(first.prefix);
  });

  it("stays safe to put in a cookie without escaping", () => {
    const { raw } = generateSessionToken();

    expect(encodeURIComponent(raw)).toBe(raw);
  });
});

describe("parseSessionTokenPrefix", () => {
  it("returns the prefix of a well-formed token", () => {
    expect(parseSessionTokenPrefix(`dsv_0123456789ab_${"a".repeat(43)}`)).toBe("0123456789ab");
  });

  it.each([
    ["an empty value", ""],
    ["a short prefix", `dsv_0123456789_${"a".repeat(43)}`],
    ["a non-hex prefix", `dsv_0123456789zz_${"a".repeat(43)}`],
    ["a short secret", `dsv_0123456789ab_${"a".repeat(42)}`],
    ["surrounding whitespace", ` dsv_0123456789ab_${"a".repeat(43)} `],
    ["a bare uuid", "9c4b6f2e-5a1d-4c8b-9e3f-2a7d6b5c4e1f"],
  ])("rejects %s before any lookup happens", (_description, value) => {
    expect(parseSessionTokenPrefix(value)).toBeUndefined();
  });
});

/**
 * The property the whole two-credential design rests on. If either parser ever
 * accepted the other's token, a lookup in the wrong table becomes reachable.
 */
describe("session and ingestion tokens", () => {
  it("cannot be mistaken for each other", () => {
    const session = generateSessionToken();
    const ingestion = generateProjectToken();

    expect(parseProjectTokenPrefix(session.raw)).toBeUndefined();
    expect(parseSessionTokenPrefix(ingestion.raw)).toBeUndefined();

    expect(parseSessionTokenPrefix(session.raw)).toBe(session.prefix);
    expect(parseProjectTokenPrefix(ingestion.raw)).toBe(ingestion.prefix);
  });
});

describe("hashSessionToken", () => {
  it("digests the whole token and never matches the absent stand-in", () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token.raw)).toBe(token.hash);
    expect(token.hash).not.toBe(ABSENT_SESSION_HASH);
  });
});
