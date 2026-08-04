import { z } from "zod";

const LOG_RECORDS_URL = "/api/v1/log-records";
const LIST_LOG_RECORDS_OPERATION = "list-log-records";

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

export class LogRecordsFetchError extends Error {
  readonly operation: string;
  readonly url: string;
  readonly status?: number;

  constructor(
    message: string,
    context: { operation: string; url: string; status?: number; cause?: unknown },
  ) {
    super(message, { cause: context.cause });
    this.name = "LogRecordsFetchError";
    this.operation = context.operation;
    this.url = context.url;
    this.status = context.status;
  }
}

/**
 * Fetches a project's newest-first log records and validates them against the
 * web-owned mirror of the response contract before returning typed values.
 */
export async function fetchLogRecords(init: {
  projectId: string;
  level?: LogLevel;
  signal?: AbortSignal;
}): Promise<LogRecordSummary[]> {
  const parameters = new URLSearchParams({ projectId: init.projectId });
  if (init.level != null) parameters.set("level", init.level);
  const url = `${LOG_RECORDS_URL}?${parameters.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, { signal: init.signal });
  } catch (cause) {
    throw new LogRecordsFetchError(`Could not reach ${url} to list log records.`, {
      operation: LIST_LOG_RECORDS_OPERATION,
      url,
      cause,
    });
  }

  if (!response.ok) {
    throw new LogRecordsFetchError(
      `Listing log records failed: ${url} responded with ${response.status} ${response.statusText}.`,
      { operation: LIST_LOG_RECORDS_OPERATION, url, status: response.status },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new LogRecordsFetchError(
      `Listing log records failed: ${url} did not return valid JSON.`,
      { operation: LIST_LOG_RECORDS_OPERATION, url, status: response.status, cause },
    );
  }

  const parsed = logRecordListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new LogRecordsFetchError(
      `Listing log records failed: the response from ${url} did not match the expected contract.`,
      { operation: LIST_LOG_RECORDS_OPERATION, url, status: response.status, cause: parsed.error },
    );
  }

  return parsed.data.records;
}
