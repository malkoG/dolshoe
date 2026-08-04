/**
 * The project that owns every event recorded before projects existed.
 *
 * @remarks
 * The id is fixed, not generated, and is written by the
 * `20260804000000_add_projects_and_project_tokens` migration. The legacy
 * `INGEST_TOKEN` lives in the environment rather than the database, so the
 * ingestion guard has to resolve it to a project without a lookup. Changing
 * either value here without a matching migration would silently strand every
 * legacy ingest; `projects.e2e-spec.ts` asserts the two stay in step.
 */
export const DEFAULT_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

export const DEFAULT_PROJECT_SLUG = "default";
