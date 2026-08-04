-- An offer to join an organization, carried by a one-time link.
--
-- Dolshoe sends no email. An operator copies the link into whatever they
-- already use, which is what keeps SMTP configuration, a delivery queue, and
-- bounce handling out of a self-hosted install. Only the digest of the link's
-- token is stored, the same contract as an ingestion token: the plaintext
-- exists once, in the response that issued it.
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invitation_prefix_key" ON "Invitation"("prefix");
CREATE INDEX "Invitation_organizationId_createdAt_idx"
    ON "Invitation"("organizationId", "createdAt" DESC);

-- Deliberately no unique constraint on (organizationId, email): re-inviting
-- someone after an invitation expires or is revoked is normal, so the service
-- revokes any outstanding one rather than the database refusing a second.
ALTER TABLE "Invitation"
    ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict rather than cascade, unlike the organization above: who invited
-- whom is a record worth keeping, and losing it silently when an account is
-- deleted would be the wrong default for the one audit trail here.
ALTER TABLE "Invitation"
    ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
