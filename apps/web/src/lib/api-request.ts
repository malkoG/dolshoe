import { z } from "zod";

/**
 * A call to the Dolshoe API that did not produce a usable response.
 *
 * @remarks
 * Carries the operation and the URL so a caller can report which call failed
 * without matching on message text. `status` is absent exactly when the request
 * never got a response at all, which is what distinguishes an unreachable API
 * from one that refused the request.
 */
export class ApiError extends Error {
  readonly operation: string;
  readonly url: string;
  readonly status?: number;

  constructor(
    message: string,
    context: { operation: string; url: string; status?: number; cause?: unknown },
  ) {
    super(message, { cause: context.cause });
    this.name = "ApiError";
    this.operation = context.operation;
    this.url = context.url;
    this.status = context.status;
  }
}

/**
 * Performs one API call and validates it against the web-owned mirror of the
 * response contract, distinguishing the four ways it can fail so a caller can
 * tell an unreachable API from a contract mismatch.
 *
 * @param operation - A verb phrase naming the call, read straight into the error
 * message, so it reads as "Could not {operation}".
 */
export async function requestJson<T>(
  operation: string,
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ApiError(`Could not reach ${url} to ${operation}.`, { operation, url, cause });
  }

  if (!response.ok) {
    throw new ApiError(
      `Could not ${operation}: ${url} responded with ${response.status} ${response.statusText}.`,
      { operation, url, status: response.status },
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ApiError(`Could not ${operation}: ${url} did not return valid JSON.`, {
      operation,
      url,
      status: response.status,
      cause,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      `Could not ${operation}: the response from ${url} did not match the expected contract.`,
      { operation, url, status: response.status, cause: parsed.error },
    );
  }

  return parsed.data;
}

export function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}
