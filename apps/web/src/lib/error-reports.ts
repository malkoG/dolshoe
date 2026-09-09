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

const userContextSchema = z.object({
  id: z.string().optional(),
  email: z.string().optional(),
  username: z.string().optional(),
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
  user: userContextSchema.optional(),
  tags: z.record(z.string(), z.string()).optional(),
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

const breadcrumbSchema = z.object({
  timestamp: z.string(),
  message: z.string().optional(),
  category: z.string().optional(),
  level: z.enum(["trace", "debug", "info", "warning", "error", "fatal"]).optional(),
  data: z.record(z.string(), z.json()).optional(),
});

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
  user: userContextSchema.optional(),
  tags: z.record(z.string(), z.string()).optional(),
  breadcrumbs: z.array(breadcrumbSchema).optional(),
  attributes: z.record(z.string(), z.json()).optional(),
});

export type ErrorReportSummary = z.infer<typeof errorReportSummarySchema>;
export type ErrorReportListResponse = z.infer<typeof errorReportListResponseSchema>;
export type ErrorReportDetail = z.infer<typeof errorReportDetailSchema>;
export type StackFrame = z.infer<typeof stackFrameSchema>;
export type UserContext = z.infer<typeof userContextSchema>;
export type Breadcrumb = z.infer<typeof breadcrumbSchema>;

/**
 * Fetches the newest-first error report list from the API and validates it against the
 * web-owned mirror of the API-01 response contract before returning typed values.
 *
 * @remarks
 * `tagKey`/`tagValue` and `userId` are server-side filters, not a client-side
 * narrowing of an already-fetched page: the list is bounded, so filtering it
 * in the browser would only ever narrow whatever page happened to load, the
 * same reasoning `fetchLogRecords`'s `level` filter already follows.
 */
export async function fetchErrorReports(
  orgSlug: string,
  projectId: string,
  init: { tagKey?: string; tagValue?: string; userId?: string; signal?: AbortSignal } = {},
): Promise<ErrorReportSummary[]> {
  const parameters = new URLSearchParams();
  if (init.tagKey != null) parameters.set("tagKey", init.tagKey);
  if (init.tagValue != null) parameters.set("tagValue", init.tagValue);
  if (init.userId != null) parameters.set("userId", init.userId);
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;

  const { reports } = await requestJson(
    "list error reports",
    `/api/v1/orgs/${orgSlug}/projects/${projectId}/error-reports${query}`,
    errorReportListResponseSchema,
    { signal: init.signal },
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
