import { AsyncLocalStorage } from "node:async_hooks";
import type { Scope, ScopeData } from "@dolshoe/core";

/**
 * User identity, tags, and breadcrumbs, kept in async context.
 *
 * @remarks
 * Core's fallback scope is one mutable object, which is correct for
 * straight-line code and wrong for a server: two requests setting a user
 * concurrently would each see the other's. `AsyncLocalStorage` gives every
 * async chain its own view, the same reason `createAsyncSpanScope` needs one.
 *
 * `?? root` covers code that runs before any `withScope()` call — at startup,
 * say — which still needs somewhere for `setUser`/`setTag`/`addBreadcrumb` to
 * mutate rather than throwing.
 */
export function createAsyncScope(): Scope {
  const storage = new AsyncLocalStorage<ScopeData>();
  const root: ScopeData = { tags: {}, breadcrumbs: [] };

  return {
    active() {
      return storage.getStore() ?? root;
    },
    run<T>(data: ScopeData, callback: () => T): T {
      return storage.run(data, callback);
    },
  };
}
