CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- Organization slugs carry the global uniqueness that project slugs used to,
-- because an organization slug is what appears in a URL with nothing above it
-- to disambiguate.
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_createdAt_idx" ON "Organization"("createdAt" DESC);

CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Membership_organizationId_userId_key"
    ON "Membership"("organizationId", "userId");
-- "Which organizations am I in" is on the path of every authenticated request.
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- Cascades from both sides: a membership is a link, and a link outliving either
-- end it joins is not something worth keeping.
ALTER TABLE "Membership"
    ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership"
    ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The default organization owns every project created before organizations
-- existed, including the default project itself. Its id is fixed rather than
-- generated so an instance being upgraded has a stable tenant to backfill into
-- and so the API can name it without a lookup. Deliberately a different value
-- from DEFAULT_PROJECT_ID, so a query that joins the wrong column matches
-- nothing instead of matching by accident. Mirrored in TypeScript as
-- DEFAULT_ORGANIZATION_ID in apps/api/src/organizations/default-organization.ts.
INSERT INTO "Organization" ("id", "slug", "name")
VALUES ('00000000-0000-4000-8000-000000000002', 'default', 'Default')
ON CONFLICT ("id") DO NOTHING;

-- Every account that already exists becomes an owner of it. In practice that is
-- at most one — registration closes after the first — but doing it here is what
-- keeps an instance claimed before this migration from coming back up with an
-- account that can see nothing.
INSERT INTO "Membership" ("id", "organizationId", "userId", "role")
SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000000002', "id", 'OWNER'
FROM "User"
ON CONFLICT ("organizationId", "userId") DO NOTHING;

-- Add, backfill, then constrain, the same way projects were given to events.
-- The column intentionally has no default: a default would silently absorb a
-- future bug where a project is created outside any organization.
ALTER TABLE "Project" ADD COLUMN "organizationId" UUID;
UPDATE "Project" SET "organizationId" = '00000000-0000-4000-8000-000000000002';
ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;

-- Restrict rather than cascade, matching ErrorReport -> Project: deleting an
-- organization that still owns projects fails loudly rather than reaching
-- through them into event data.
ALTER TABLE "Project"
    ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A slug only has to be unique inside the organization that owns it. Create the
-- composite index before dropping the global one so an unexpected duplicate
-- aborts this migration rather than leaving the table briefly unprotected. Safe
-- unconditionally here: every row was just backfilled to a single organization,
-- so the composite is a strict weakening of a constraint that already held.
--
-- Not reversible once two organizations both own a project of the same name.
-- Restoring the global index would then fail, so a rollback means re-slugging
-- the duplicates first.
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");
DROP INDEX "Project_slug_key";

-- Listing projects is always organization-scoped now, so the composite recency
-- index supersedes the global one.
CREATE INDEX "Project_organizationId_createdAt_idx"
    ON "Project"("organizationId", "createdAt" DESC);
DROP INDEX "Project_createdAt_idx";
