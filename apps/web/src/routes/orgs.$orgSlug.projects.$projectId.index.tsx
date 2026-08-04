import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Reports are the section people come to a project for.
 */
export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/orgs/$orgSlug/projects/$projectId/reports", params });
  },
});
