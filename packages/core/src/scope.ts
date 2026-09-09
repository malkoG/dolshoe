import type { Scope, ScopeData } from "./types.js";

/**
 * The fallback scope store: one mutable object, restored on the way out.
 *
 * @remarks
 * Correct for synchronous code and for a single chain of awaits, which is what
 * a script or a worker usually is. It is *not* correct for a server handling
 * two requests at once — a user or tag set while handling one would leak into
 * the other — which is why `@dolshoe/node`, `@dolshoe/bun`, and `@dolshoe/deno`
 * each install an `AsyncLocalStorage`-backed scope instead. Core keeps this
 * one so that a `Client` built by hand, or one running somewhere without async
 * context, still has somewhere for `setUser`/`setTag`/`addBreadcrumb` to
 * mutate rather than refusing to.
 */
export function createSynchronousScope(): Scope {
  let current: ScopeData = { tags: {}, breadcrumbs: [] };

  return {
    active() {
      return current;
    },
    run<T>(data: ScopeData, callback: () => T): T {
      const previous = current;
      current = data;
      try {
        return callback();
      } finally {
        current = previous;
      }
    },
  };
}
