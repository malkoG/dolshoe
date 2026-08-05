import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { logout } from "./session";

/**
 * Ending the session, from wherever the viewer happens to be.
 *
 * @remarks
 * The order matters and is easy to get wrong in a second copy: the router has
 * to be invalidated between the call and the navigation, so the root load runs
 * again and the app forgets who this was before the sign-in page renders.
 * Without it the browser arrives at `/login`, which promptly redirects a viewer
 * it still believes is signed in straight back into the app.
 */
export function useSignOut(): () => Promise<void> {
  const router = useRouter();

  return useCallback(async () => {
    await logout();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }, [router]);
}
