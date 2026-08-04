import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Ingestion tokens look like `dsh_<prefix>_<secret>`.
 *
 * The prefix is stored in the clear and uniquely identifies the token, so a
 * presented token can be looked up with one indexed probe before its secret is
 * verified. Only the SHA-256 digest of the whole string is persisted, so a
 * database disclosure does not hand out working tokens.
 *
 * Every character is URL-unreserved, which is what lets a token sit in the
 * userinfo position of a DSN without percent-encoding.
 */
const TOKEN_SCHEME = "dsh";
const PREFIX_BYTES = 6;
const SECRET_BYTES = 32;

const PREFIX_LENGTH = PREFIX_BYTES * 2;
const SECRET_LENGTH = Math.ceil((SECRET_BYTES * 4) / 3);
const HASH_LENGTH = 64;

const TOKEN_PATTERN = new RegExp(
  `^${TOKEN_SCHEME}_([0-9a-f]{${PREFIX_LENGTH}})_[A-Za-z0-9_-]{${SECRET_LENGTH}}$`,
);

/**
 * Compared against when no stored token was found, so a prefix that does not
 * exist costs the same as a prefix whose secret is wrong.
 */
export const ABSENT_TOKEN_HASH = "0".repeat(HASH_LENGTH);

export interface GeneratedProjectToken {
  /** The only time the token exists in plaintext on the server. */
  readonly raw: string;
  readonly prefix: string;
  readonly hash: string;
}

export function generateProjectToken(): GeneratedProjectToken {
  const prefix = randomBytes(PREFIX_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const raw = `${TOKEN_SCHEME}_${prefix}_${secret}`;

  return { raw, prefix, hash: hashProjectToken(raw) };
}

/**
 * Returns the lookup prefix of a well-formed token, or `undefined` for anything
 * that is not one. Callers use `undefined` to skip the database entirely.
 */
export function parseProjectTokenPrefix(raw: string): string | undefined {
  return TOKEN_PATTERN.exec(raw)?.[1];
}

export function hashProjectToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Constant-time comparison of two SHA-256 hex digests. Both operands are fixed
 * length by construction, so unlike a raw token comparison this never needs a
 * length pre-check that would leak through an early return.
 */
export function hashesMatch(actual: string, expected: string): boolean {
  if (actual.length !== HASH_LENGTH || expected.length !== HASH_LENGTH) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
