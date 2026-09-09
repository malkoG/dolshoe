-- ErrorReport and Span already have a leading-(projectId) index ordered by the
-- timestamp a per-project listing or window query filters on. LogRecord only had
-- a bare "projectId" index, so a project-scoped time range fell back to scanning
-- every row in the project instead of the index. This brings it to parity.
CREATE INDEX "LogRecord_projectId_receivedAt_idx"
    ON "LogRecord"("projectId", "receivedAt" DESC);
