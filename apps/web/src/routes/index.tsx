import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Navigation is project-first, so the root has nothing of its own to show.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});
