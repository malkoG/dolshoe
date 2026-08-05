/**
 * How many frames a JavaScript runtime is asked to keep on an `Error`.
 *
 * @remarks
 * `Error.stackTraceLimit` defaults to 10. Everything downstream of it — this
 * package's own `MAX_FRAMES`, the ingestion contract's `MAX_STACK_FRAMES`, the
 * Python reporter, which walks a whole traceback — allows 200, so the default is
 * where a JavaScript stack actually stops, and a report from a framework never
 * reaches the application code that called it. Raising it is the one change that
 * makes the rest of the budget real.
 */
export const DEFAULT_STACK_FRAME_LIMIT = 200;

/**
 * Ask the runtime to keep `limit` frames, and hand back a way to undo it.
 *
 * @remarks
 * The property is global and shared with everything else in the process, so it
 * is restored on `close()` rather than left raised. Collecting more frames costs
 * a little on every `Error` construction, including errors nobody reports, which
 * is why `stackFrameLimit: false` exists.
 *
 * A runtime that does not implement V8's stack API — or implements it read-only —
 * gets a no-op instead of a thrown error out of `init()`. Whether the assignment
 * really took on each supported runtime is not something this function can know;
 * `examples/logtape-runtimes/verify.mjs` measures an actual stack on Node, Deno
 * and Bun, which is the only honest test of it.
 */
export function applyStackFrameLimit(limit: number): () => void {
  // `number | undefined` rather than an optional property: a runtime that does
  // not implement the field at all must be restored to not having it, which
  // `exactOptionalPropertyTypes` would otherwise refuse to express.
  const errorConstructor = Error as unknown as { stackTraceLimit: number | undefined };
  const previous = errorConstructor.stackTraceLimit;

  try {
    errorConstructor.stackTraceLimit = limit;
  } catch {
    return () => {};
  }

  return () => {
    try {
      errorConstructor.stackTraceLimit = previous;
    } catch {
      // Nothing useful to do: the value was writable a moment ago and is not
      // now, and failing to restore a limit must not fail a shutdown.
    }
  };
}
