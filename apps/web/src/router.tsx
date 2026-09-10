import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { SIGNED_OUT_SESSION } from "./lib/session";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    // Replaced by the root route's beforeLoad before anything renders. Present
    // only so descendants can read `context.session` without narrowing it.
    context: { session: SIGNED_OUT_SESSION },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
}

/**
 * A route names its own breadcrumb segment here rather than the page
 * component computing it — `useMatches()` can then assemble the whole trail
 * from any depth without each route needing to know its ancestors' labels.
 * A string covers most routes; a function reaches into that match's own
 * params/context/loaderData for the routes whose label isn't fixed at
 * route-definition time (an organization or project's name, a report or
 * trace's short id).
 */
export interface BreadcrumbMatchInfo {
  context: unknown;
  loaderData: unknown;
  params: Record<string, string | undefined>;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    breadcrumb?: string | ((match: BreadcrumbMatchInfo) => string);
  }
}
