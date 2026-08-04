import {
  GeneratedOpaqueToken,
  defineOpaqueTokenScheme,
  hashOpaqueToken,
} from "../credentials/opaque-token";

export { ABSENT_TOKEN_HASH, hashesMatch } from "../credentials/opaque-token";

/**
 * Ingestion tokens are opaque credentials under the `dsh` scheme, so they look
 * like `dsh_<prefix>_<secret>`.
 *
 * The scheme is what lets the ingestion guard reject a credential of any other
 * kind without touching the database, and every character is URL-unreserved,
 * which is what lets a token sit in the userinfo position of a DSN without
 * percent-encoding.
 */
const projectTokenScheme = defineOpaqueTokenScheme("dsh");

export type GeneratedProjectToken = GeneratedOpaqueToken;

export function generateProjectToken(): GeneratedProjectToken {
  return projectTokenScheme.generate();
}

/**
 * Returns the lookup prefix of a well-formed ingestion token, or `undefined` for
 * anything that is not one. Callers use `undefined` to skip the database entirely.
 */
export function parseProjectTokenPrefix(raw: string): string | undefined {
  return projectTokenScheme.parsePrefix(raw);
}

export function hashProjectToken(raw: string): string {
  return hashOpaqueToken(raw);
}
