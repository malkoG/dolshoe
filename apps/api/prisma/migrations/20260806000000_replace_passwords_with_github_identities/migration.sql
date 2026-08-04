-- GitHub becomes the only way to sign in.
--
-- Three destructive steps, each of which loses something that has no meaning
-- under the new model. Rolling this out means every operator signs in through
-- GitHub afterwards, and outstanding invitations have to be re-issued.

-- 1. Passwords. There is nothing left that verifies one.
ALTER TABLE "User" DROP COLUMN "passwordHash";

-- The GitHub identity. Nullable so accounts that predate this migration keep
-- their memberships: such a row cannot be signed into until the first GitHub
-- account with a matching address adopts it.
ALTER TABLE "User" ADD COLUMN "githubUserId" VARCHAR(32);
ALTER TABLE "User" ADD COLUMN "githubLogin" VARCHAR(39);
ALTER TABLE "User" ADD COLUMN "avatarUrl" VARCHAR(500);

CREATE UNIQUE INDEX "User_githubUserId_key" ON "User"("githubUserId");
CREATE INDEX "User_githubLogin_idx" ON "User"("githubLogin");

-- 2. Live sessions. Every one of them was established with a password, and an
-- instance that has just removed password sign-in should not still be carrying
-- browsers that were let in by one.
DELETE FROM "Session";

-- 3. Invitations. An invitation now names a GitHub login, and there is no
-- honest way to derive one from the address a link was issued to — guessing
-- would hand a seat to whoever happens to hold the matching handle. Accepted
-- rows go too: they are a record of the old addressing scheme, and the
-- memberships they produced are unaffected.
DELETE FROM "Invitation";

ALTER TABLE "Invitation" DROP COLUMN "email";
ALTER TABLE "Invitation" ADD COLUMN "githubLogin" VARCHAR(39) NOT NULL;
