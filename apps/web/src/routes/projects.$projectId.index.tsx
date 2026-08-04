import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Reports are the section people come to a project for.
 */
export const Route = createFileRoute("/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/reports", params });
  },
});
