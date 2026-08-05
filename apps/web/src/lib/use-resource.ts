import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One fetched thing, in whichever of its three states it is currently in.
 *
 * @remarks
 * A union rather than a `{ data, loading, error }` triple, so the impossible
 * combinations — loaded and failing, ready with no data — cannot be written
 * down at all, and a caller that reads `data` has already proved it arrived.
 */
export type ResourceState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

/**
 * Loads something when a screen opens, and again when it is asked to.
 *
 * @remarks
 * Every list in this app had its own copy of the same effect: a `cancelled`
 * flag, an `AbortController`, and a counter to force a re-run. They agreed on
 * the behaviour and differed only in what they fetched, which is the shape of
 * something that should have been written once.
 *
 * Both halves of the teardown are load-bearing and do different jobs. Aborting
 * stops the request; the flag stops a response that was already in flight from
 * writing state into a screen that has moved on.
 *
 * @param load - Runs the request. It is given the `AbortSignal` to pass through
 * to `fetch`, and is read fresh on every run rather than being a dependency, so
 * a caller does not have to memoize it.
 * @param dependencies - What the load reads. Changing any of them refetches.
 * Must keep a stable length between renders, exactly like a hook's own
 * dependency array.
 */
export function useResource<T>(
  load: (options: { signal: AbortSignal }) => Promise<T>,
  dependencies: readonly unknown[],
): Readonly<{ reload: () => void; state: ResourceState<T> }> {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  // Written during render on purpose, and never read during one: it exists so
  // the effect below can call the newest `load` without listing it as a
  // dependency, which would restart the request on every parent render.
  const latestLoad = useRef(load);
  latestLoad.current = load;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    latestLoad
      .current({ signal: controller.signal })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [...dependencies, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { reload, state };
}
