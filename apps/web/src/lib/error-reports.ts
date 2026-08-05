import { z } from "zod";

import { requestJson } from "./api-request";

const sourceLocationSchema = z.object({
  fileName: z.string().optional(),
  lineNumber: z.number().int().positive().optional(),
  columnNumber: z.number().int().nonnegative().optional(),
  functionName: z.string().optional(),
});

const errorReportExceptionSummarySchema = z.object({
  type: z.string().optional(),
  message: z.string().optional(),
  source: sourceLocationSchema.optional(),
});

const errorReportSummarySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  occurredAt: z.string(),
  receivedAt: z.string(),
  project: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
  }),
  service: z.object({
    name: z.string(),
    environment: z.string().optional(),
    release: z.string().optional(),
  }),
  runtime: z.object({
    name: z.string(),
    version: z.string().optional(),
  }),
  exception: errorReportExceptionSummarySchema,
});

const errorReportListResponseSchema = z.object({
  reports: z.array(errorReportSummarySchema),
});

const stackFrameSchema = z.object({
  functionName: z.string().optional(),
  moduleName: z.string().optional(),
  fileName: z.string().optional(),
  lineNumber: z.number().int().positive().optional(),
  columnNumber: z.number().int().nonnegative().optional(),
  sourceLine: z.string().optional(),
  preContext: z.array(z.string()).optional(),
  postContext: z.array(z.string()).optional(),
  inApp: z.boolean().optional(),
  origin: z.enum(["app", "dependency", "runtime"]).optional(),
  native: z.boolean().optional(),
  async: z.boolean().optional(),
});

/**
 * The stored exception tree. Recursive through `cause`, `context` and
 * `children`, which is why it needs the explicit interface Zod cannot infer for
 * itself.
 */
export interface NormalizedException {
  type?: string;
  message?: string;
  code?: string | number;
  stacktrace?: string;
  frames?: z.infer<typeof stackFrameSchema>[];
  source?: z.infer<typeof sourceLocationSchema>;
  value?: { type: string; representation?: string };
  cause?: NormalizedException;
  context?: NormalizedException;
  children?: NormalizedException[];
}

const normalizedExceptionSchema: z.ZodType<NormalizedException> = z.lazy(() =>
  z.object({
    type: z.string().optional(),
    message: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
    stacktrace: z.string().optional(),
    frames: z.array(stackFrameSchema).optional(),
    source: sourceLocationSchema.optional(),
    value: z.object({ type: z.string(), representation: z.string().optional() }).optional(),
    cause: normalizedExceptionSchema.optional(),
    context: normalizedExceptionSchema.optional(),
    children: z.array(normalizedExceptionSchema).optional(),
  }),
);

const errorReportDetailSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  occurredAt: z.string(),
  receivedAt: z.string(),
  project: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
  }),
  service: z.object({
    name: z.string(),
    environment: z.string().optional(),
    release: z.string().optional(),
  }),
  runtime: z.object({
    name: z.string(),
    version: z.string().optional(),
  }),
  reporter: z.object({
    name: z.string(),
    version: z.string().optional(),
  }),
  mechanism: z.object({ type: z.string(), handled: z.boolean().optional() }).optional(),
  trace: z.object({ traceId: z.string(), spanId: z.string().optional() }).optional(),
  exception: normalizedExceptionSchema,
  attributes: z.record(z.string(), z.json()).optional(),
});

export type ErrorReportSummary = z.infer<typeof errorReportSummarySchema>;
export type ErrorReportListResponse = z.infer<typeof errorReportListResponseSchema>;
export type ErrorReportDetail = z.infer<typeof errorReportDetailSchema>;
export type StackFrame = z.infer<typeof stackFrameSchema>;

/**
 * Fetches the newest-first error report list from the API and validates it against the
 * web-owned mirror of the API-01 response contract before returning typed values.
 */
export async function fetchErrorReports(
  orgSlug: string,
  projectId: string,
  init?: { signal?: AbortSignal },
): Promise<ErrorReportSummary[]> {
  const { reports } = await requestJson(
    "list error reports",
    `/api/v1/orgs/${orgSlug}/projects/${projectId}/error-reports`,
    errorReportListResponseSchema,
    init,
  );
  return reports;
}

/**
 * Fetches one stored report in full — every frame of every exception in its
 * chain — which the list endpoint deliberately does not carry.
 */
export async function fetchErrorReport(
  orgSlug: string,
  projectId: string,
  reportId: string,
  init?: { signal?: AbortSignal },
): Promise<ErrorReportDetail> {
  return requestJson(
    "read error report",
    `/api/v1/orgs/${orgSlug}/projects/${projectId}/error-reports/${reportId}`,
    errorReportDetailSchema,
    init,
  );
}
