import {
  GeneratedOpaqueToken,
  defineOpaqueTokenScheme,
  hashOpaqueToken,
} from "../credentials/opaque-token";

export { ABSENT_TOKEN_HASH as ABSENT_INVITATION_HASH } from "../credentials/opaque-token";

/**
 * Invitation tokens are opaque credentials under the `dsi` scheme, so an
 * invitation link is `/invitations/dsi_<prefix>_<secret>`.
 *
 * A third scheme rather than reusing either existing one: an invitation grants
 * membership, which is neither a session nor permission to ingest, and keeping
 * the schemes distinct is what stops any of the three being presented where
 * another is expected.
 */
const invitationTokenScheme = defineOpaqueTokenScheme("dsi");

export type GeneratedInvitationToken = GeneratedOpaqueToken;

export function generateInvitationToken(): GeneratedInvitationToken {
  return invitationTokenScheme.generate();
}

export function parseInvitationTokenPrefix(raw: string): string | undefined {
  return invitationTokenScheme.parsePrefix(raw);
}

export function hashInvitationToken(raw: string): string {
  return hashOpaqueToken(raw);
}
