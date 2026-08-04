import { z } from "zod";

const ERROR_REPORTS_URL = "/api/v1/error-reports";
const LIST_ERROR_REPORTS_OPERATION = "list-error-reports";

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

export class ErrorReportsFetchError extends Error {
  readonly operation: string;
  readonly url: string;
  readonly status?: number;

  constructor(
    message: string,
    context: { operation: string; url: string; status?: number; cause?: unknown },
  ) {
    super(message, { cause: context.cause });
    this.name = "ErrorReportsFetchError";
    this.operation = context.operation;
    this.url = context.url;
    this.status = context.status;
  }
}

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

  let response: Response;
  try {
    response = await fetch(url, { signal: init?.signal });
  } catch (cause) {
    throw new ErrorReportsFetchError(`Could not reach ${url} to list error reports.`, {
      operation: LIST_ERROR_REPORTS_OPERATION,
      url,
      cause,
    });
  }

  if (!response.ok) {
    throw new ErrorReportsFetchError(
      `Listing error reports failed: ${url} responded with ${response.status} ${response.statusText}.`,
      { operation: LIST_ERROR_REPORTS_OPERATION, url, status: response.status },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ErrorReportsFetchError(
      `Listing error reports failed: ${url} did not return valid JSON.`,
      {
        operation: LIST_ERROR_REPORTS_OPERATION,
        url,
        status: response.status,
        cause,
      },
    );
  }

  const parsed = errorReportListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ErrorReportsFetchError(
      `Listing error reports failed: the response from ${url} did not match the expected contract.`,
      {
        operation: LIST_ERROR_REPORTS_OPERATION,
        url,
        status: response.status,
        cause: parsed.error,
      },
    );
  }

  return parsed.data.reports;
}
