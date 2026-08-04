/**
 * The organization that owns every project created before organizations existed.
 *
 * @remarks
 * Written by the `20260805001000_add_organizations_and_memberships` migration,
 * which also backfills every project into it and makes every account that
 * already existed an owner of it.
 *
 * The id is fixed rather than generated so an instance being upgraded has a
 * stable tenant to backfill into, and so registration can name it without a
 * lookup. Deliberately a different value from `DEFAULT_PROJECT_ID`: a query that
 * joins the wrong column then matches nothing, instead of matching by accident.
 */
export const DEFAULT_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";

export const DEFAULT_ORGANIZATION_SLUG = "default";
