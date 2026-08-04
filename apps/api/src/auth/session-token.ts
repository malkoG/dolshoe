import {
  GeneratedOpaqueToken,
  defineOpaqueTokenScheme,
  hashOpaqueToken,
} from "../credentials/opaque-token";

export { ABSENT_TOKEN_HASH as ABSENT_SESSION_HASH } from "../credentials/opaque-token";

/**
 * Session tokens are opaque credentials under the `dsv` scheme — "viewer" — so
 * they look like `dsv_<prefix>_<secret>`.
 *
 * The scheme is deliberately not `dsh`. An ingestion token and a session token
 * are read from different places, stored in different tables, and grant
 * unrelated things; giving them separate schemes means each parser rejects the
 * other's credential outright, before any lookup, rather than relying on the
 * lookup to miss.
 */
const sessionTokenScheme = defineOpaqueTokenScheme("dsv");

export type GeneratedSessionToken = GeneratedOpaqueToken;

export function generateSessionToken(): GeneratedSessionToken {
  return sessionTokenScheme.generate();
}

/**
 * Returns the lookup prefix of a well-formed session token, or `undefined` for
 * anything that is not one — including a well-formed ingestion token. Callers
 * use `undefined` to reject without touching the database.
 */
export function parseSessionTokenPrefix(raw: string): string | undefined {
  return sessionTokenScheme.parsePrefix(raw);
}

export function hashSessionToken(raw: string): string {
  return hashOpaqueToken(raw);
}
