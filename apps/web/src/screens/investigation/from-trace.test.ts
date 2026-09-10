import { describe, expect, test } from "vitest";

import type { TraceDetailResponse, TraceSpan } from "../../lib/traces";
import { firstFailingSpanId, investigationFromTrace } from "./from-trace";

function span(overrides: Partial<TraceSpan> & Pick<TraceSpan, "spanId" | "name">): TraceSpan {
  return {
    id: overrides.spanId,
    parentSpanId: null,
    depth: 0,
    kind: "internal",
    statusCode: "ok",
    statusMessage: null,
    serviceName: "checkout-api",
    scopeName: null,
    scopeVersion: null,
    startedAt: "2026-09-06T01:11:00.000Z",
    startOffsetNanoseconds: 0,
    durationNanoseconds: 1_000_000,
    attributes: null,
    resourceAttributes: null,
    ...overrides,
  };
}

function detail(spans: TraceSpan[], overrides: Partial<TraceDetailResponse["trace"]> = {}) {
  return {
    trace: {
      traceId: "4f2aaaaaaaaaaaaaaaaaaaaaaaaaa9c1e",
      startedAt: "2026-09-06T01:11:00.000Z",
      durationNanoseconds: 142_000_000,
      spanCount: spans.length,
      truncated: false,
      ...overrides,
    },
    spans,
  };
}

describe("investigationFromTrace", () => {
  test("hangs an error and a log off the span they named, not as a union row", () => {
    const root = span({ spanId: "aaaabbbbccccdddd", name: "GET /checkout" });
    const child = span({
      spanId: "1111222233334444",
      name: "payment.authorize",
      parentSpanId: root.spanId,
      depth: 1,
      statusCode: "error",
    });

    const model = investigationFromTrace(detail([root, child]), {
      errors: [
        {
          spanId: child.spanId,
          reportId: "report-1",
          title: "CardDeclinedError: do_not_honor",
          source: "payments/authorize.ts:88",
          service: "payments",
          occurredLabel: "2 min ago",
          fingerprintLabel: "fp 3e91c0a7",
          handled: true,
        },
      ],
      logs: [
        {
          spanId: child.spanId,
          id: "log-1",
          message: "issuer latency 1.8s exceeds 1s budget",
          category: "issuer.latency",
          service: "payments",
          occurredLabel: "13:02:42.911",
          level: "warning",
        },
      ],
    });

    expect(model.spans).toHaveLength(2);
    expect(model.spans[0]?.errors).toEqual([]);
    expect(model.spans[0]?.logs).toEqual([]);
    expect(model.spans[1]?.errors).toHaveLength(1);
    expect(model.spans[1]?.logs).toHaveLength(1);
    expect(model.spans[1]?.errors[0]?.title).toContain("CardDeclinedError");
    expect(model.pendingParents).toEqual([]);
  });

  test("derives a pending-parent slot above the first orphan that named it", () => {
    const root = span({ spanId: "aaaabbbbccccdddd", name: "GET /checkout" });
    const orphan = span({
      spanId: "ffff000011112222",
      name: "orphan.handler",
      parentSpanId: "a1b2c3d4e5f60718",
      statusCode: "error",
    });

    const model = investigationFromTrace(detail([root, orphan]));

    expect(model.spans[1]?.parentMissing).toBe(true);
    expect(model.missingParentCount).toBe(1);
    expect(model.pendingParents).toEqual([
      {
        spanId: "a1b2c3d4e5f60718",
        referencedByCount: 1,
        beforeSpanId: orphan.spanId,
      },
    ]);
  });

  test("counts failing spans and preserves truncation", () => {
    const spans = [
      span({ spanId: "0000000000000001", name: "root" }),
      span({ spanId: "0000000000000002", name: "fail", statusCode: "error" }),
    ];
    const model = investigationFromTrace(detail(spans, { truncated: true, spanCount: 2413 }));

    expect(model.failingCount).toBe(1);
    expect(model.truncated).toBe(true);
    expect(model.shownSpanCount).toBe(2);
    expect(model.totalSpanCount).toBe(2413);
  });

  test("firstFailingSpanId picks the first error span", () => {
    const spans = investigationFromTrace(
      detail([
        span({ spanId: "0000000000000001", name: "ok" }),
        span({ spanId: "0000000000000002", name: "fail", statusCode: "error" }),
      ]),
    ).spans;

    expect(firstFailingSpanId(spans)).toBe("0000000000000002");
  });
});
