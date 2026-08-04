/**
 * Flattening a trace's spans into the order a waterfall draws them.
 *
 * @remarks
 * Done here rather than in the browser so every client does not reimplement it,
 * and because what to do with a span whose parent is missing is a question about
 * the data — which the server is better placed to answer than each consumer
 * guessing separately.
 */

export interface OrderedSpan<T> {
  span: T;
  /** How many ancestors the span has inside this trace. Zero for a root. */
  depth: number;
}

interface Orderable {
  spanId: string;
  parentSpanId: string | null;
  startTimeUnixNano: bigint;
}

function byStart(left: Orderable, right: Orderable): number {
  if (left.startTimeUnixNano === right.startTimeUnixNano) {
    // Ties would otherwise order by whatever the database returned. Comparing
    // ids keeps a trace's waterfall identical between two reads of it.
    return left.spanId < right.spanId ? -1 : 1;
  }
  return left.startTimeUnixNano < right.startTimeUnixNano ? -1 : 1;
}

/**
 * Depth-first, parents before children, siblings oldest first.
 *
 * @remarks
 * A span whose parent is not in the set is treated as a root. That is not an
 * error case to hide: the parent may belong to a service that does not report
 * here, may still be in flight, or may have aged out — and the child is real
 * telemetry either way. Such orphans are drawn after the true roots.
 *
 * Traversal is iterative and tracks what it has already emitted, so a span that
 * claims itself as its parent, or a cycle between two spans, terminates and
 * yields every span exactly once instead of looping.
 */
export function orderSpansDepthFirst<T extends Orderable>(spans: readonly T[]): OrderedSpan<T>[] {
  const present = new Set(spans.map((span) => span.spanId));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];
  const orphans: T[] = [];

  for (const span of spans) {
    const parent = span.parentSpanId;
    if (parent == null) {
      roots.push(span);
      continue;
    }
    if (!present.has(parent) || parent === span.spanId) {
      orphans.push(span);
      continue;
    }
    const siblings = childrenOf.get(parent);
    if (siblings == null) childrenOf.set(parent, [span]);
    else siblings.push(span);
  }

  for (const siblings of childrenOf.values()) siblings.sort(byStart);
  roots.sort(byStart);
  orphans.sort(byStart);

  const ordered: OrderedSpan<T>[] = [];
  const emitted = new Set<string>();
  // Reversed, because the stack pops from the end and siblings must come out
  // oldest first.
  const stack: OrderedSpan<T>[] = [...roots, ...orphans]
    .toReversed()
    .map((span) => ({ span, depth: 0 }));

  while (stack.length > 0) {
    const next = stack.pop();
    if (next == null) break;
    if (emitted.has(next.span.spanId)) continue;

    emitted.add(next.span.spanId);
    ordered.push(next);

    const children = childrenOf.get(next.span.spanId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child != null && !emitted.has(child.spanId)) {
        stack.push({ span: child, depth: next.depth + 1 });
      }
    }
  }

  // A cycle among spans none of whose members is reachable from a root leaves
  // them unemitted. They are still telemetry; show them rather than lose them.
  for (const span of spans) {
    if (!emitted.has(span.spanId)) {
      emitted.add(span.spanId);
      ordered.push({ span, depth: 0 });
    }
  }

  return ordered;
}
