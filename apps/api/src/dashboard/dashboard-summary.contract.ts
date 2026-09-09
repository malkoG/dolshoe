import { z } from "zod";

/**
 * Trailing window a v1 summary always covers.
 *
 * @remarks
 * Not yet a request parameter. A fixed window keeps the first cut small and
 * gives the aggregation queries and their bucketing math one shape to be
 * correct about; a caller-chosen window is a later, separate contract change.
 */
export const DASHBOARD_SUMMARY_WINDOW_DAYS = 7;

const contractRegistry = z.registry<{ id?: string; description?: string }>();

export const dashboardWindowSchema = z
  .object({
    since: z.iso
      .datetime()
      .meta({ description: "Start of the summarized window, inclusive, UTC." }),
    until: z.iso.datetime().meta({ description: "End of the summarized window, exclusive, UTC." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "DashboardWindowV1",
    description: "The fixed trailing period a dashboard summary was computed over.",
  });

export const dashboardVolumeBucketSchema = z
  .object({
    bucketStart: z.iso.datetime().meta({ description: "UTC start of this one-day bucket." }),
    errorReports: z
      .int()
      .nonnegative()
      .meta({ description: "Error reports received during this bucket." }),
    logRecords: z
      .int()
      .nonnegative()
      .meta({ description: "Log records received during this bucket." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "DashboardVolumeBucketV1",
    description: "One day of ingested volume, by signal.",
  });

export const dashboardErrorReportSummarySchema = z
  .object({
    total: z.int().nonnegative().meta({ description: "Error reports received in the window." }),
    previousPeriodTotal: z.int().nonnegative().meta({
      description:
        "Error reports received in the period immediately before the window, of equal length, for trend comparison.",
    }),
    byEnvironment: z.record(z.string(), z.int().nonnegative()).meta({
      description:
        'Counts keyed by service.environment. A report with no environment is counted under "unspecified".',
    }),
    byRuntime: z.record(z.string(), z.int().nonnegative()).meta({
      description: "Counts keyed by runtime.name.",
    }),
    lastOccurredAt: z.iso.datetime().nullable().meta({
      description:
        "occurredAt of the project's most recent error report ever received, or null if none has.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "DashboardErrorReportSummaryV1",
    description: "Error report activity for a project's dashboard.",
  });

export const dashboardLogRecordSummarySchema = z
  .object({
    total: z.int().nonnegative().meta({ description: "Log records received in the window." }),
    lastOccurredAt: z.iso.datetime().nullable().meta({
      description:
        "occurredAt of the project's most recent log record ever received, or null if none has.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "DashboardLogRecordSummaryV1",
    description: "Log record activity for a project's dashboard.",
  });

export const dashboardTraceSummarySchema = z
  .object({
    total: z.int().nonnegative().meta({ description: "Root spans received in the window." }),
    lastOccurredAt: z.iso.datetime().nullable().meta({
      description:
        "startedAt of the project's most recent root span ever received, or null if none has.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "DashboardTraceSummaryV1",
    description: "Trace activity for a project's dashboard.",
  });

export const dashboardSummarySchema = z
  .object({
    window: dashboardWindowSchema,
    errorReports: dashboardErrorReportSummarySchema,
    logRecords: dashboardLogRecordSummarySchema,
    traces: dashboardTraceSummarySchema,
    volumeSeries: z
      .array(dashboardVolumeBucketSchema)
      .length(DASHBOARD_SUMMARY_WINDOW_DAYS)
      .meta({
        description: `Daily ingestion volume for the trailing ${DASHBOARD_SUMMARY_WINDOW_DAYS} days, oldest first.`,
      }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ProjectDashboardSummaryV1",
    description:
      "Aggregated error report, log, and trace activity for one project, over a fixed trailing window.",
  });

export type DashboardWindow = z.infer<typeof dashboardWindowSchema>;
export type DashboardVolumeBucket = z.infer<typeof dashboardVolumeBucketSchema>;
export type DashboardErrorReportSummary = z.infer<typeof dashboardErrorReportSummarySchema>;
export type DashboardLogRecordSummary = z.infer<typeof dashboardLogRecordSummarySchema>;
export type DashboardTraceSummary = z.infer<typeof dashboardTraceSummarySchema>;
export type ProjectDashboardSummary = z.infer<typeof dashboardSummarySchema>;

function adaptJsonSchemaToOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(adaptJsonSchemaToOpenApi);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const adapted: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (key === "$id") {
      continue;
    }

    if (key === "examples" && Array.isArray(child) && child.length > 0) {
      adapted.example = adaptJsonSchemaToOpenApi(child[0]);
      continue;
    }

    adapted[key] = adaptJsonSchemaToOpenApi(child);
  }

  return adapted;
}

const generatedSchemas = z.toJSONSchema(contractRegistry, {
  target: "openapi-3.0",
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
}).schemas;

export const dashboardOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
