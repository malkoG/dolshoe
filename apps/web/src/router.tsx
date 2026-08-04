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

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
