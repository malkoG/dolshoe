import type { Span, SpanScope } from "./types.js";

/**
 * The fallback active-span store: one variable, restored on the way out.
 *
 * @remarks
 * Correct for synchronous code and for a single chain of awaits, which is what
 * a script or a worker usually is. It is *not* correct for a server handling
 * two requests at once — whichever started a span last would be the parent of
 * both — which is why `@dolshoe/node`, `@dolshoe/bun`, and `@dolshoe/deno` each
 * install an `AsyncLocalStorage`-backed scope instead. Core keeps this one so
 * that a `Client` built by hand, or one running somewhere without async
 * context, still nests spans rather than refusing to.
 */
export function createSynchronousSpanScope(): SpanScope {
  let current: Span | undefined;

  return {
    active() {
      return current;
    },
    run<T>(span: Span, callback: () => T): T {
      const previous = current;
      current = span;
      try {
        return callback();
      } finally {
        current = previous;
      }
    },
  };
}
