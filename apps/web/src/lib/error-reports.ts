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
  signal?: AbortSignal;
}): Promise<ErrorReportSummary[]> {
  let response: Response;
  try {
    response = await fetch(ERROR_REPORTS_URL, { signal: init?.signal });
  } catch (cause) {
    throw new ErrorReportsFetchError(
      `Could not reach ${ERROR_REPORTS_URL} to list error reports.`,
      { operation: LIST_ERROR_REPORTS_OPERATION, url: ERROR_REPORTS_URL, cause },
    );
  }

  if (!response.ok) {
    throw new ErrorReportsFetchError(
      `Listing error reports failed: ${ERROR_REPORTS_URL} responded with ${response.status} ${response.statusText}.`,
      { operation: LIST_ERROR_REPORTS_OPERATION, url: ERROR_REPORTS_URL, status: response.status },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ErrorReportsFetchError(
      `Listing error reports failed: ${ERROR_REPORTS_URL} did not return valid JSON.`,
      {
        operation: LIST_ERROR_REPORTS_OPERATION,
        url: ERROR_REPORTS_URL,
        status: response.status,
        cause,
      },
    );
  }

  const parsed = errorReportListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ErrorReportsFetchError(
      `Listing error reports failed: the response from ${ERROR_REPORTS_URL} did not match the expected contract.`,
      {
        operation: LIST_ERROR_REPORTS_OPERATION,
        url: ERROR_REPORTS_URL,
        status: response.status,
        cause: parsed.error,
      },
    );
  }

  return parsed.data.reports;
}
