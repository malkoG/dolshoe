import { z } from "zod";

import { requestJson } from "./api-request";

const logRecordSummarySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  occurredAt: z.string(),
  receivedAt: z.string(),
  level: z.enum(["trace", "debug", "info", "warning", "error", "fatal"]),
  message: z.string(),
  category: z.array(z.string()),
  service: z.object({
    name: z.string(),
    environment: z.string().optional(),
    release: z.string().optional(),
  }),
  errorReportEventId: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
});

const logRecordListResponseSchema = z.object({
  records: z.array(logRecordSummarySchema),
});

export type LogRecordSummary = z.infer<typeof logRecordSummarySchema>;
export type LogLevel = LogRecordSummary["level"];

/**
 * Fetches a project's newest-first log records and validates them against the
 * web-owned mirror of the response contract before returning typed values.
 */
export async function fetchLogRecords(
  orgSlug: string,
  projectId: string,
  init: { level?: LogLevel; signal?: AbortSignal } = {},
): Promise<LogRecordSummary[]> {
  const parameters = new URLSearchParams();
  if (init.level != null) parameters.set("level", init.level);
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  const url = `/api/v1/orgs/${orgSlug}/projects/${projectId}/log-records${query}`;

  const { records } = await requestJson("list log records", url, logRecordListResponseSchema, {
    signal: init.signal,
  });
  return records;
}
