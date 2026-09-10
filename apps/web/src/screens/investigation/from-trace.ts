import { formatDuration, formatRelativeTime } from "../../lib/format";
import type { TraceDetailResponse, TraceSpan } from "../../lib/traces";
import type {
  Investigation,
  InvestigationError,
  InvestigationLog,
  InvestigationSpan,
} from "./types";

/**
 * Builds the Investigation view model from a stored trace.
 *
 * @remarks
 * Errors and logs are passed in as their own arrays and hung off the span
 * they named. They are never folded into the span list as a union. Pending
 * parent slots are derived here: a `parentSpanId` that is not in the set is
 * a missing parent, and the first orphan that named it gets the dashed slot
 * above it.
 */
export function investigationFromTrace(
  detail: TraceDetailResponse,
  attachments: {
    errors?: ReadonlyArray<InvestigationError & { spanId: string }>;
    logs?: ReadonlyArray<InvestigationLog & { spanId: string }>;
  } = {},
): Investigation {
  const present = new Set(detail.spans.map((span) => span.spanId));
  const errorsBySpan = groupBySpanId(attachments.errors ?? []);
  const logsBySpan = groupBySpanId(attachments.logs ?? []);

  const spans: InvestigationSpan[] = detail.spans.map((span) =>
    mapSpan(span, present, errorsBySpan.get(span.spanId) ?? [], logsBySpan.get(span.spanId) ?? []),
  );

  const pendingParents = pendingParentsFrom(spans);
  const failingCount = spans.filter((span) => span.statusCode === "error").length;

  return {
    traceId: detail.trace.traceId,
    truncated: detail.trace.truncated,
    shownSpanCount: spans.length,
    totalSpanCount: detail.trace.spanCount,
    failingCount,
    durationNanoseconds: detail.trace.durationNanoseconds,
    startedLabel: `started ${formatRelativeTime(detail.trace.startedAt)}`,
    missingParentCount: pendingParents.length,
    spans,
    pendingParents,
  };
}

export function firstFailingSpanId(spans: readonly InvestigationSpan[]): string | null {
  return spans.find((span) => span.statusCode === "error")?.spanId ?? null;
}

function mapSpan(
  span: TraceSpan,
  present: ReadonlySet<string>,
  errors: readonly InvestigationError[],
  logs: readonly InvestigationLog[],
): InvestigationSpan {
  const parentMissing = span.parentSpanId != null && !present.has(span.parentSpanId);
  const scopeLabel =
    span.scopeName == null
      ? null
      : span.scopeVersion == null
        ? span.scopeName
        : `${span.scopeName} ${span.scopeVersion}`;

  return {
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    parentMissing,
    depth: span.depth,
    name: span.name,
    kind: span.kind,
    statusCode: span.statusCode,
    statusMessage: span.statusMessage,
    serviceName: span.serviceName,
    scopeLabel,
    startedAt: span.startedAt,
    startOffsetNanoseconds: span.startOffsetNanoseconds,
    durationNanoseconds: span.durationNanoseconds,
    attributes: span.attributes,
    errors,
    logs,
  };
}

function pendingParentsFrom(spans: readonly InvestigationSpan[]): Investigation["pendingParents"] {
  const seen = new Map<string, { referencedByCount: number; beforeSpanId: string }>();

  for (const span of spans) {
    if (!span.parentMissing || span.parentSpanId == null) continue;

    const existing = seen.get(span.parentSpanId);
    if (existing == null) {
      seen.set(span.parentSpanId, { referencedByCount: 1, beforeSpanId: span.spanId });
    } else {
      existing.referencedByCount += 1;
    }
  }

  return [...seen.entries()].map(([spanId, slot]) => ({ spanId, ...slot }));
}

function groupBySpanId<T extends { spanId: string }>(items: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const list = grouped.get(item.spanId);
    if (list == null) grouped.set(item.spanId, [item]);
    else list.push(item);
  }
  return grouped;
}

/** Duration shown on a row. A span with nothing to measure reads as an em dash. */
export function spanDurationLabel(durationNanoseconds: number | null): string {
  if (durationNanoseconds == null) return "—";
  return formatDuration(durationNanoseconds);
}
