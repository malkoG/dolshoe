import { AsyncLocalStorage } from "node:async_hooks";
import type { Span, SpanScope } from "@dolshoe/core";

/**
 * The active span, kept in async context.
 *
 * @remarks
 * Core's fallback scope is one variable, which is correct for straight-line
 * code and wrong for a server: two requests starting spans concurrently would
 * each see the other's as their parent. `AsyncLocalStorage` gives every async
 * chain its own view, so a span started inside one request stays inside it.
 *
 * The same mechanism LogTape asks for when it takes an `AsyncLocalStorage` for
 * its implicit contexts — and available here, on Node, Deno, and Bun alike.
 */
export function createAsyncSpanScope(): SpanScope {
  const storage = new AsyncLocalStorage<Span>();

  return {
    active() {
      return storage.getStore();
    },
    run<T>(span: Span, callback: () => T): T {
      return storage.run(span, callback);
    },
  };
}
