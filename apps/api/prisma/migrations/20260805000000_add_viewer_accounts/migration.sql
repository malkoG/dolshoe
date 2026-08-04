-- Viewer accounts and the sessions that authenticate them in a browser.
--
-- Deliberately separate tables from ProjectToken rather than a shared credential
-- table with a "kind" column. An ingestion token is a machine credential
-- presented in an Authorization header; a session is a browser credential
-- presented in a cookie. Keeping them apart is what makes it impossible for a
-- lookup of one to ever return the other, which is a property worth more than
-- the duplication it costs.
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "passwordHash" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Addresses are lowercased at the transport boundary, so a plain unique index is
-- enough. A case-insensitive collation would move that rule into the database,
-- where the code that has to enforce it could no longer see it.
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt" DESC);

CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- The prefix is how a presented cookie is found: one indexed probe before its
-- secret is checked, exactly as ProjectToken does it.
CREATE UNIQUE INDEX "Session_prefix_key" ON "Session"("prefix");
CREATE INDEX "Session_userId_createdAt_idx" ON "Session"("userId", "createdAt" DESC);
-- Expiring sessions are swept by deadline, not by user.
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- A session has no meaning without the account it belongs to, so it cascades,
-- the same way an ingestion token cascades from its project.
ALTER TABLE "Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
