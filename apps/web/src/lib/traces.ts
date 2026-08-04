import { z } from "zod";

import { requestJson } from "./api-request";

const spanKindSchema = z.enum(["internal", "server", "client", "producer", "consumer"]);
const spanStatusSchema = z.enum(["unset", "ok", "error"]);

const traceSummarySchema = z.object({
  traceId: z.string(),
  rootSpanId: z.string(),
  name: z.string(),
  kind: spanKindSchema,
  serviceName: z.string(),
  environment: z.string().nullable(),
  startedAt: z.string(),
  durationNanoseconds: z.number(),
  statusCode: spanStatusSchema,
  spanCount: z.number(),
  errorSpanCount: z.number(),
});

const traceListResponseSchema = z.object({
  traces: z.array(traceSummarySchema),
});

const traceSpanSchema = z.object({
  id: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  depth: z.number(),
  name: z.string(),
  kind: spanKindSchema,
  statusCode: spanStatusSchema,
  statusMessage: z.string().nullable(),
  serviceName: z.string(),
  scopeName: z.string().nullable(),
  scopeVersion: z.string().nullable(),
  startedAt: z.string(),
  startOffsetNanoseconds: z.number(),
  durationNanoseconds: z.number(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  resourceAttributes: z.record(z.string(), z.unknown()).nullable(),
});

const traceDetailResponseSchema = z.object({
  trace: z.object({
    traceId: z.string(),
    startedAt: z.string(),
    durationNanoseconds: z.number(),
    spanCount: z.number(),
    truncated: z.boolean(),
  }),
  spans: z.array(traceSpanSchema),
});

export type TraceSummary = z.infer<typeof traceSummarySchema>;
export type TraceSpan = z.infer<typeof traceSpanSchema>;
export type TraceDetailResponse = z.infer<typeof traceDetailResponseSchema>;
export type SpanKind = z.infer<typeof spanKindSchema>;
export type SpanStatus = z.infer<typeof spanStatusSchema>;

/**
 * Fetches a project's newest-first traces and validates them against the
 * web-owned mirror of the response contract before returning typed values.
 */
export async function fetchTraces(
  orgSlug: string,
  projectId: string,
  init: { signal?: AbortSignal } = {},
): Promise<TraceSummary[]> {
  const url = `/api/v1/orgs/${orgSlug}/projects/${projectId}/traces`;

  const { traces } = await requestJson("list traces", url, traceListResponseSchema, {
    signal: init.signal,
  });
  return traces;
}

/**
 * Fetches one trace and its spans, already ordered and depth-tagged by the
 * server — the waterfall renders the array as it arrives.
 */
export async function fetchTrace(
  orgSlug: string,
  projectId: string,
  traceId: string,
  init: { signal?: AbortSignal } = {},
): Promise<TraceDetailResponse> {
  const url = `/api/v1/orgs/${orgSlug}/projects/${projectId}/traces/${traceId}`;

  return requestJson("load a trace", url, traceDetailResponseSchema, { signal: init.signal });
}
