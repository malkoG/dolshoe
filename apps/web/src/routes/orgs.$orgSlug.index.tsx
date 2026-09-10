import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The organization layout has nothing of its own to show — projects is the
 * first thing anyone arriving bare at an organization can act on. Also what
 * makes the organization's own breadcrumb crumb a link to somewhere real,
 * rather than the layout route's empty `<Outlet/>`.
 */
export const Route = createFileRoute("/orgs/$orgSlug/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/orgs/$orgSlug/projects", params: { orgSlug: params.orgSlug } });
  },
});
