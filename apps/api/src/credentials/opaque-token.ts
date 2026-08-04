import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque credentials look like `<scheme>_<prefix>_<secret>`.
 *
 * The prefix is stored in the clear and uniquely identifies the credential, so a
 * presented value can be looked up with one indexed probe before its secret is
 * verified. Only the SHA-256 digest of the whole string is persisted, so a
 * database disclosure does not hand out working credentials.
 *
 * Every character is URL-unreserved, which is what lets a credential sit in the
 * userinfo position of a DSN, or in a cookie, without escaping.
 *
 * The scheme is the part that keeps two kinds of credential from being mistaken
 * for each other: a parser bound to one scheme rejects the other's tokens
 * outright, before any lookup happens.
 */
const PREFIX_BYTES = 6;
const SECRET_BYTES = 32;

const PREFIX_LENGTH = PREFIX_BYTES * 2;
const SECRET_LENGTH = Math.ceil((SECRET_BYTES * 4) / 3);
const HASH_LENGTH = 64;

/**
 * Compared against when no stored credential was found, so a prefix that does not
 * exist costs the same as a prefix whose secret is wrong.
 */
export const ABSENT_TOKEN_HASH = "0".repeat(HASH_LENGTH);

export interface GeneratedOpaqueToken {
  /** The only time the credential exists in plaintext on the server. */
  readonly raw: string;
  readonly prefix: string;
  readonly hash: string;
}

export interface OpaqueTokenScheme {
  generate(): GeneratedOpaqueToken;
  /**
   * Returns the lookup prefix of a well-formed credential of this scheme, or
   * `undefined` for anything that is not one — including a well-formed credential
   * of a different scheme. Callers use `undefined` to skip the database entirely.
   */
  parsePrefix(raw: string): string | undefined;
}

/**
 * Binds the shared construction to one scheme.
 *
 * @remarks
 * Returns an object rather than taking the scheme on every call so the pattern is
 * compiled once, at module load, rather than on every credential presented.
 */
export function defineOpaqueTokenScheme(scheme: string): OpaqueTokenScheme {
  const pattern = new RegExp(
    `^${scheme}_([0-9a-f]{${PREFIX_LENGTH}})_[A-Za-z0-9_-]{${SECRET_LENGTH}}$`,
  );

  return {
    generate(): GeneratedOpaqueToken {
      const prefix = randomBytes(PREFIX_BYTES).toString("hex");
      const secret = randomBytes(SECRET_BYTES).toString("base64url");
      const raw = `${scheme}_${prefix}_${secret}`;

      return { raw, prefix, hash: hashOpaqueToken(raw) };
    },

    parsePrefix(raw: string): string | undefined {
      return pattern.exec(raw)?.[1];
    },
  };
}

export function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Constant-time comparison of two SHA-256 hex digests. Both operands are fixed
 * length by construction, so unlike a raw credential comparison this never needs a
 * length pre-check that would leak through an early return.
 */
export function hashesMatch(actual: string, expected: string): boolean {
  if (actual.length !== HASH_LENGTH || expected.length !== HASH_LENGTH) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
