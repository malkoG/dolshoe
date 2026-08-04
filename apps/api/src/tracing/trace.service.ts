import { Injectable } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { orderSpansDepthFirst } from "./order-spans";
import { flattenOtlpSpans } from "./otlp-spans";
import {
  OtlpExportTraceServiceRequest,
  OtlpExportTraceServiceResponse,
} from "./otlp-trace.contract";
import { SpanDetailRow, SpanRepository, TraceCountRow, TraceRootRow } from "./span.repository";
import {
  MAX_TRACE_SPANS,
  TRACE_LIST_LIMIT,
  TraceDetailResponse,
  TraceListResponse,
  TraceSpan,
  TraceSummary,
} from "./trace.contract";

const logger = getLogger(["dolshoe", "tracing", "ingestion"]);

function toSummary(root: TraceRootRow, counts: TraceCountRow | undefined): TraceSummary {
  return {
    traceId: root.traceId,
    rootSpanId: root.spanId,
    name: root.name,
    // Stored as plain strings, so a row written before today's vocabulary is
    // passed through rather than re-validated here — the same way log levels are.
    kind: root.kind as TraceSummary["kind"],
    serviceName: root.serviceName,
    environment: root.environment,
    startedAt: root.startedAt.toISOString(),
    durationNanoseconds: Number(root.durationNanoseconds),
    statusCode: root.statusCode as TraceSummary["statusCode"],
    // A root always counts itself, so a missing entry means the counting query
    // and the listing query disagreed — treat the root as all we know about.
    spanCount: counts?.total ?? 1,
    errorSpanCount: counts?.errors ?? 0,
  };
}

function toTraceSpan(row: SpanDetailRow, depth: number, traceStart: bigint): TraceSpan {
  return {
    id: row.id,
    spanId: row.spanId,
    parentSpanId: row.parentSpanId,
    depth,
    name: row.name,
    kind: row.kind as TraceSpan["kind"],
    statusCode: row.statusCode as TraceSpan["statusCode"],
    statusMessage: row.statusMessage,
    serviceName: row.serviceName,
    scopeName: row.scopeName,
    scopeVersion: row.scopeVersion,
    startedAt: row.startedAt.toISOString(),
    startOffsetNanoseconds: Number(row.startTimeUnixNano - traceStart),
    durationNanoseconds: Number(row.durationNanoseconds),
    attributes: (row.attributes ?? null) as TraceSpan["attributes"],
    resourceAttributes: (row.resourceAttributes ?? null) as TraceSpan["resourceAttributes"],
  };
}

@Injectable()
export class TraceService {
  constructor(private readonly spans: SpanRepository) {}

  /**
   * Store the spans of one OTLP export.
   *
   * @remarks
   * Spans that could not be read are counted into OTLP's partial success rather
   * than failing the request. An exporter retries on a 5xx, so rejecting a batch
   * over a span the server has already judged unreadable would have it resent
   * until it expired.
   */
  async export(
    request: OtlpExportTraceServiceRequest,
    projectId: string,
  ): Promise<OtlpExportTraceServiceResponse> {
    const { spans, rejected, firstRejection } = flattenOtlpSpans(request);

    await this.spans.store(projectId, spans);

    if (rejected === 0) return { partialSuccess: {} };

    logger.warn("Rejected {rejected} of {received} exported spans: {reason}", {
      projectId,
      rejected,
      received: spans.length + rejected,
      reason: firstRejection,
    });

    return {
      partialSuccess: {
        // A proto3 int64 is a string in JSON, even when it is small.
        rejectedSpans: String(rejected),
        ...(firstRejection == null ? {} : { errorMessage: firstRejection }),
      },
    };
  }

  async list(organizationId: string, projectId: string): Promise<TraceListResponse> {
    const roots = await this.spans.listRootSpans(organizationId, projectId, TRACE_LIST_LIMIT);
    const counts = new Map(
      (
        await this.spans.countSpansByTrace(
          projectId,
          roots.map((root) => root.traceId),
        )
      ).map((row) => [row.traceId, row]),
    );

    return { traces: roots.map((root) => toSummary(root, counts.get(root.traceId))) };
  }

  /**
   * One trace, as the waterfall draws it.
   *
   * @remarks
   * A trace nobody has reported reads as an empty one rather than a 404. The
   * caller asked about a trace id, not a resource: "no spans under that id" is a
   * true and useful answer, and it is the same answer whether the id never
   * existed or its spans have aged out.
   */
  async detail(
    organizationId: string,
    projectId: string,
    traceId: string,
  ): Promise<TraceDetailResponse> {
    // One more than the bound, so a trace that was cut can say so.
    const rows = await this.spans.listSpansForTrace(
      organizationId,
      projectId,
      traceId,
      MAX_TRACE_SPANS + 1,
    );
    const truncated = rows.length > MAX_TRACE_SPANS;
    const kept = truncated ? rows.slice(0, MAX_TRACE_SPANS) : rows;

    if (kept.length === 0) {
      return {
        trace: {
          traceId,
          startedAt: new Date(0).toISOString(),
          durationNanoseconds: 0,
          spanCount: 0,
          truncated: false,
        },
        spans: [],
      };
    }

    let traceStart = kept[0]?.startTimeUnixNano ?? 0n;
    let traceEnd = traceStart;
    let earliest = kept[0]?.startedAt ?? new Date(0);
    for (const row of kept) {
      if (row.startTimeUnixNano < traceStart) {
        traceStart = row.startTimeUnixNano;
        earliest = row.startedAt;
      }
      const end = row.startTimeUnixNano + row.durationNanoseconds;
      if (end > traceEnd) traceEnd = end;
    }

    const ordered = orderSpansDepthFirst(kept);

    return {
      trace: {
        traceId,
        startedAt: earliest.toISOString(),
        durationNanoseconds: Number(traceEnd - traceStart),
        spanCount: kept.length,
        truncated,
      },
      spans: ordered.map(({ span, depth }) => toTraceSpan(span, depth, traceStart)),
    };
  }
}
