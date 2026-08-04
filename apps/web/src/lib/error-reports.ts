import { z } from "zod";

import { requestJson } from "./api-request";

const ERROR_REPORTS_URL = "/api/v1/error-reports";

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

export type ErrorReportSummary = z.infer<typeof errorReportSummarySchema>;
export type ErrorReportListResponse = z.infer<typeof errorReportListResponseSchema>;

/**
 * Fetches the newest-first error report list from the API and validates it against the
 * web-owned mirror of the API-01 response contract before returning typed values.
 */
export async function fetchErrorReports(init?: {
  projectId?: string;
  signal?: AbortSignal;
}): Promise<ErrorReportSummary[]> {
  const url =
    init?.projectId == null
      ? ERROR_REPORTS_URL
      : `${ERROR_REPORTS_URL}?${new URLSearchParams({ projectId: init.projectId }).toString()}`;

  const { reports } = await requestJson("list error reports", url, errorReportListResponseSchema, {
    signal: init?.signal,
  });
  return reports;
}
