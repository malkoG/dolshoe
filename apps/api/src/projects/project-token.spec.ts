import { createHash } from "node:crypto";

import {
  ABSENT_TOKEN_HASH,
  generateProjectToken,
  hashProjectToken,
  hashesMatch,
  parseProjectTokenPrefix,
} from "./project-token";

const TOKEN_SHAPE = /^dsh_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/;

describe("generateProjectToken", () => {
  it("produces a token whose prefix and hash describe the token itself", () => {
    const token = generateProjectToken();

    expect(token.raw).toMatch(TOKEN_SHAPE);
    expect(parseProjectTokenPrefix(token.raw)).toBe(token.prefix);
    expect(token.hash).toBe(createHash("sha256").update(token.raw).digest("hex"));
    expect(token.hash).toHaveLength(64);
  });

  it("does not repeat itself", () => {
    const first = generateProjectToken();
    const second = generateProjectToken();

    expect(second.raw).not.toBe(first.raw);
    expect(second.prefix).not.toBe(first.prefix);
  });

  it("stays URL-unreserved so it can sit in the userinfo position of a DSN", () => {
    const { raw } = generateProjectToken();

    expect(encodeURIComponent(raw)).toBe(raw);
  });
});

describe("parseProjectTokenPrefix", () => {
  it("returns the prefix of a well-formed token", () => {
    expect(parseProjectTokenPrefix(`dsh_0123456789ab_${"a".repeat(43)}`)).toBe("0123456789ab");
  });

  it.each([
    ["an empty value", ""],
    ["another scheme", `sntry_0123456789ab_${"a".repeat(43)}`],
    ["a short prefix", `dsh_0123456789_${"a".repeat(43)}`],
    ["a non-hex prefix", `dsh_0123456789zz_${"a".repeat(43)}`],
    ["a short secret", `dsh_0123456789ab_${"a".repeat(42)}`],
    ["a secret with reserved characters", `dsh_0123456789ab_${"a".repeat(42)}/`],
    ["surrounding whitespace", ` dsh_0123456789ab_${"a".repeat(43)} `],
    ["a bare uuid", "9c4b6f2e-5a1d-4c8b-9e3f-2a7d6b5c4e1f"],
  ])("rejects %s before any lookup happens", (_description, value) => {
    expect(parseProjectTokenPrefix(value)).toBeUndefined();
  });
});

describe("hashesMatch", () => {
  it("accepts identical digests and rejects different ones", () => {
    const token = generateProjectToken();
    const other = generateProjectToken();

    expect(hashesMatch(hashProjectToken(token.raw), token.hash)).toBe(true);
    expect(hashesMatch(other.hash, token.hash)).toBe(false);
  });

  it("rejects a tampered secret", () => {
    const token = generateProjectToken();
    const tampered = `${token.raw.slice(0, -1)}${token.raw.endsWith("A") ? "B" : "A"}`;

    expect(hashesMatch(hashProjectToken(tampered), token.hash)).toBe(false);
  });

  it("rejects the stand-in used when no token was found", () => {
    const token = generateProjectToken();

    expect(hashesMatch(token.hash, ABSENT_TOKEN_HASH)).toBe(false);
  });

  it("rejects values that are not digests rather than throwing", () => {
    expect(hashesMatch("abc", "abc")).toBe(false);
  });
});
