import { formatTraceChip } from "./format";
import type {
  Investigation,
  InvestigationCrumb,
  InvestigationSpan,
  InvestigationViewProps,
} from "./types";

function figmaTrail(currentLabel: string): InvestigationCrumb[] {
  return [
    { label: "Acme Payments" },
    { label: "checkout-api" },
    { label: "Traces" },
    { label: currentLabel, current: true },
  ];
}

/**
 * Named states for Investigation.
 *
 * @remarks
 * Figma page 25 ships three frames that change the silhouette: incomplete
 * (orphan + pending parent), truncated, and loading. There is no empty or
 * error frame on that page — inventing one would photograph a state the
 * surface cannot reach from the design.
 */
const INCOMPLETE_TRACE_ID = "4f2aaaaaaaaaaaaaaaaaaaaaaaaaa9c1e";
const TRUNCATED_TRACE_ID = "9c1eaaaaaaaaaaaaaaaaaaaaaaaa4f2a";

function span(partial: InvestigationSpan): InvestigationSpan {
  return partial;
}

function incomplete(): InvestigationViewProps {
  const authorize = span({
    spanId: "7f2a9c1e3b4d5e6f",
    parentSpanId: "aaaabbbbccccdddd",
    parentMissing: false,
    depth: 1,
    name: "payment.authorize",
    kind: "client",
    statusCode: "error",
    statusMessage: "card declined by issuer (do_not_honor)",
    serviceName: "payments",
    scopeLabel: "@dolshoe/sdk-js 0.4.2",
    startedAt: "2026-09-06T01:11:00.412Z",
    startOffsetNanoseconds: 28_000_000,
    durationNanoseconds: 61_000_000,
    attributes: {
      "http.method": "POST",
      "http.route": "/api/v1/payments/authorize",
      "peer.service": "issuer-gateway",
      "retry.count": 2,
      "payment.provider": "stripe",
    },
    errors: [
      {
        reportId: "report-card-declined",
        title: "CardDeclinedError: card declined by issuer (do_not_honor)",
        source: "payments/authorize.ts:88",
        service: "payments",
        occurredLabel: "2 min ago",
        fingerprintLabel: "fp 3e91c0a7",
        handled: true,
      },
    ],
    logs: [
      {
        id: "log-issuer-latency",
        message: "issuer latency 1.8s exceeds 1s budget",
        category: "issuer.latency",
        service: "payments",
        occurredLabel: "13:02:42.911",
        level: "warning",
      },
    ],
  });

  const orphan = span({
    spanId: "ffff000011112222",
    parentSpanId: "a1b2c3d4e5f60718",
    parentMissing: true,
    depth: 0,
    name: "orphan.handler",
    kind: "internal",
    statusCode: "error",
    statusMessage: null,
    serviceName: "worker",
    scopeLabel: null,
    startedAt: "2026-09-06T01:11:00.500Z",
    startOffsetNanoseconds: 85_000_000,
    durationNanoseconds: null,
    attributes: null,
    errors: [
      {
        reportId: "report-typeerror",
        title: 'TypeError: Cannot read properties of undefined (reading "amount")',
        source: "checkout.js:214",
        service: "web",
        occurredLabel: "2 min ago",
        fingerprintLabel: "fp b7d2f41a",
        handled: false,
      },
    ],
    logs: [],
  });

  const investigation: Investigation = {
    traceId: INCOMPLETE_TRACE_ID,
    truncated: false,
    shownSpanCount: 6,
    totalSpanCount: 6,
    failingCount: 2,
    durationNanoseconds: 142_000_000,
    startedLabel: "started 5 min ago",
    missingParentCount: 1,
    pendingParents: [
      {
        spanId: "a1b2c3d4e5f60718",
        referencedByCount: 1,
        beforeSpanId: orphan.spanId,
      },
    ],
    spans: [
      span({
        spanId: "aaaabbbbccccdddd",
        parentSpanId: null,
        parentMissing: false,
        depth: 0,
        name: "GET /checkout",
        kind: "server",
        statusCode: "ok",
        statusMessage: null,
        serviceName: "api-gateway",
        scopeLabel: null,
        startedAt: "2026-09-06T01:11:00.000Z",
        startOffsetNanoseconds: 0,
        durationNanoseconds: 142_000_000,
        attributes: null,
        errors: [],
        logs: [],
      }),
      span({
        spanId: "bbbbccccddddeeee",
        parentSpanId: "aaaabbbbccccdddd",
        parentMissing: false,
        depth: 1,
        name: "db.query",
        kind: "client",
        statusCode: "ok",
        statusMessage: null,
        serviceName: "orders-db",
        scopeLabel: null,
        startedAt: "2026-09-06T01:11:00.010Z",
        startOffsetNanoseconds: 8_000_000,
        durationNanoseconds: 38_000_000,
        attributes: null,
        errors: [],
        logs: [],
      }),
      authorize,
      span({
        spanId: "ccccddddeeeeffff",
        parentSpanId: "aaaabbbbccccdddd",
        parentMissing: false,
        depth: 1,
        name: "cache.get",
        kind: "client",
        statusCode: "unset",
        statusMessage: null,
        serviceName: "redis",
        scopeLabel: null,
        startedAt: "2026-09-06T01:11:00.100Z",
        startOffsetNanoseconds: 90_000_000,
        durationNanoseconds: 2_000_000,
        attributes: null,
        errors: [],
        logs: [],
      }),
      span({
        spanId: "ddddeeeeffff0000",
        parentSpanId: "aaaabbbbccccdddd",
        parentMissing: false,
        depth: 1,
        name: "order.created",
        kind: "client",
        statusCode: "ok",
        statusMessage: null,
        serviceName: "checkout-api",
        scopeLabel: null,
        startedAt: "2026-09-06T01:11:00.110Z",
        startOffsetNanoseconds: 95_000_000,
        durationNanoseconds: 3_000_000,
        attributes: null,
        errors: [],
        logs: [],
      }),
      orphan,
    ],
  };

  return {
    status: "ready",
    investigation,
    expandedSpanId: authorize.spanId,
    trail: figmaTrail(`Investigation ${formatTraceChip(INCOMPLETE_TRACE_ID)}`),
  };
}

function truncated(): InvestigationViewProps {
  const root = span({
    spanId: "1111222233334444",
    parentSpanId: null,
    parentMissing: false,
    depth: 0,
    name: "POST /api/v1/batch",
    kind: "server",
    statusCode: "ok",
    statusMessage: null,
    serviceName: "api-gateway",
    scopeLabel: null,
    startedAt: "2026-09-06T00:16:00.000Z",
    startOffsetNanoseconds: 0,
    durationNanoseconds: 8_400_000_000,
    attributes: null,
    errors: [],
    logs: [],
  });

  const items: InvestigationSpan[] = [0, 1, 2, 3, 4].map((index) =>
    span({
      spanId: `item00000000000${index}`,
      parentSpanId: root.spanId,
      parentMissing: false,
      depth: 1,
      name: `process.item[${index}]`,
      kind: "client",
      statusCode: index === 2 ? "error" : "ok",
      statusMessage: null,
      serviceName: "worker",
      scopeLabel: null,
      startedAt: `2026-09-06T00:16:00.0${index}0Z`,
      startOffsetNanoseconds: (200 + index * 40) * 1_000_000,
      durationNanoseconds: (14 + index * 3) * 1_000_000,
      attributes: null,
      errors: [],
      logs: [],
    }),
  );

  return {
    status: "ready",
    investigation: {
      traceId: TRUNCATED_TRACE_ID,
      truncated: true,
      shownSpanCount: 2000,
      totalSpanCount: 2413,
      failingCount: 14,
      durationNanoseconds: 8_400_000_000,
      startedLabel: "started 1 hour ago",
      missingParentCount: 0,
      pendingParents: [],
      spans: [root, ...items],
    },
    expandedSpanId: null,
    trail: figmaTrail(`Investigation ${formatTraceChip(TRUNCATED_TRACE_ID)}`),
  };
}

function loading(): InvestigationViewProps {
  return { status: "loading", trail: figmaTrail("Investigation") };
}

export const investigationStates = {
  incomplete,
  truncated,
  loading,
} as const;

export const investigationStateNames = ["incomplete", "truncated", "loading"] as const;

export type InvestigationStateName = (typeof investigationStateNames)[number];

export function isInvestigationStateName(value: string | null): value is InvestigationStateName {
  return value != null && (investigationStateNames as readonly string[]).includes(value);
}
