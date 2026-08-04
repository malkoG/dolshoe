import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Navigation is project-first inside an organization, so the root has nothing of
 * its own to show. It sends every arrival to the first thing they can act on.
 */
export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    const { organizations, viewer } = context.session;
    const first = organizations[0];

    if (viewer == null) throw redirect({ to: "/login" });
    if (first == null) throw redirect({ to: "/orgs" });

    throw redirect({ to: "/orgs/$orgSlug/projects", params: { orgSlug: first.slug } });
  },
});
