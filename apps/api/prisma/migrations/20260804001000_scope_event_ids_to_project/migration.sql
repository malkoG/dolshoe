-- An eventId is a client-generated idempotency key, so it is only unique within
-- the project that generated it. While it was globally unique, one project could
-- replay another project's eventId and receive that project's receipt.
--
-- Create the composite indexes before dropping the single-column ones so an
-- unexpected duplicate aborts this migration rather than leaving either table
-- briefly unprotected. Safe unconditionally here: every existing row was
-- backfilled to a single project by the preceding migration, so the composite is
-- a strict weakening of a constraint that already held.
CREATE UNIQUE INDEX "ErrorReport_projectId_eventId_key"
    ON "ErrorReport"("projectId", "eventId");
DROP INDEX "ErrorReport_eventId_key";

CREATE UNIQUE INDEX "LogRecord_projectId_eventId_key"
    ON "LogRecord"("projectId", "eventId");
DROP INDEX "LogRecord_eventId_key";
