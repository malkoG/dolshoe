import { orderSpansDepthFirst } from "./order-spans";

interface TestSpan {
  spanId: string;
  parentSpanId: string | null;
  startTimeUnixNano: bigint;
}

function span(spanId: string, parentSpanId: string | null, startedAt: number): TestSpan {
  return { spanId, parentSpanId, startTimeUnixNano: BigInt(startedAt) };
}

function shape(spans: readonly TestSpan[]): string[] {
  return orderSpansDepthFirst(spans).map(
    ({ span: item, depth }) => `${"·".repeat(depth)}${item.spanId}`,
  );
}

describe("orderSpansDepthFirst", () => {
  it("walks a tree parents first, depth attached", () => {
    expect(
      shape([span("root", null, 0), span("child", "root", 10), span("grandchild", "child", 20)]),
    ).toEqual(["root", "·child", "··grandchild"]);
  });

  it("orders siblings oldest first, whatever order they arrive in", () => {
    expect(
      shape([span("late", "root", 30), span("root", null, 0), span("early", "root", 10)]),
    ).toEqual(["root", "·early", "·late"]);
  });

  it("keeps a subtree together rather than walking level by level", () => {
    expect(
      shape([
        span("root", null, 0),
        span("a", "root", 10),
        span("a1", "a", 15),
        span("b", "root", 20),
        span("b1", "b", 25),
      ]),
    ).toEqual(["root", "·a", "··a1", "·b", "··b1"]);
  });

  // A partial trace is normal: the parent may be in a service that does not
  // report here, or may still be in flight.
  it("draws a span whose parent is absent as a root, after the real roots", () => {
    expect(
      shape([span("orphan", "missing", 5), span("root", null, 0), span("child", "root", 10)]),
    ).toEqual(["root", "·child", "orphan"]);
  });

  it("terminates on a span that claims itself as its parent", () => {
    expect(shape([span("self", "self", 0)])).toEqual(["self"]);
  });

  it("emits every span exactly once when two spans point at each other", () => {
    const ordered = orderSpansDepthFirst([span("a", "b", 0), span("b", "a", 10)]);

    expect(ordered).toHaveLength(2);
    expect(ordered.map(({ span: item }) => item.spanId).toSorted()).toEqual(["a", "b"]);
  });

  it("emits a cycle that no root reaches rather than dropping it", () => {
    const ordered = orderSpansDepthFirst([
      span("root", null, 0),
      span("a", "b", 10),
      span("b", "a", 20),
    ]);

    expect(ordered.map(({ span: item }) => item.spanId).toSorted()).toEqual(["a", "b", "root"]);
  });

  it("breaks a tie on start time the same way every time", () => {
    const spans = [span("root", null, 0), span("zzz", "root", 10), span("aaa", "root", 10)];

    expect(shape(spans)).toEqual(shape([...spans].toReversed()));
    expect(shape(spans)).toEqual(["root", "·aaa", "·zzz"]);
  });

  it("has nothing to say about no spans", () => {
    expect(orderSpansDepthFirst([])).toEqual([]);
  });
});
