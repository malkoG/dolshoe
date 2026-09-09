import { z } from "zod";

import { requestJson } from "./api-request";

/**
 * Trailing window a v1 summary always covers. Not yet a request parameter —
 * see the web-owned mirror's note in `apps/api/src/dashboard/dashboard-summary.contract.ts`.
 */
export const DASHBOARD_SUMMARY_WINDOW_DAYS = 7;

const dashboardWindowSchema = z.object({
  since: z.string(),
  until: z.string(),
});

const dashboardVolumeBucketSchema = z.object({
  bucketStart: z.string(),
  errorReports: z.number().int().nonnegative(),
  logRecords: z.number().int().nonnegative(),
});

const dashboardErrorReportSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  previousPeriodTotal: z.number().int().nonnegative(),
  byEnvironment: z.record(z.string(), z.number().int().nonnegative()),
  byRuntime: z.record(z.string(), z.number().int().nonnegative()),
  lastReceivedAt: z.string().nullable(),
});

const dashboardSignalSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  lastReceivedAt: z.string().nullable(),
});

const dashboardSummarySchema = z.object({
  window: dashboardWindowSchema,
  errorReports: dashboardErrorReportSummarySchema,
  logRecords: dashboardSignalSummarySchema,
  traces: dashboardSignalSummarySchema,
  volumeSeries: z.array(dashboardVolumeBucketSchema),
});

export type DashboardWindow = z.infer<typeof dashboardWindowSchema>;
export type DashboardVolumeBucket = z.infer<typeof dashboardVolumeBucketSchema>;
export type DashboardErrorReportSummary = z.infer<typeof dashboardErrorReportSummarySchema>;
export type DashboardSignalSummary = z.infer<typeof dashboardSignalSummarySchema>;
export type ProjectDashboardSummary = z.infer<typeof dashboardSummarySchema>;

/**
 * Fetches the project's dashboard summary and validates it against the
 * web-owned mirror of the API-01 response contract before returning typed
 * values.
 */
export async function fetchProjectDashboardSummary(
  orgSlug: string,
  projectId: string,
  init?: { signal?: AbortSignal },
): Promise<ProjectDashboardSummary> {
  return requestJson(
    "read project dashboard summary",
    `/api/v1/orgs/${orgSlug}/projects/${projectId}/dashboard-summary`,
    dashboardSummarySchema,
    init,
  );
}
