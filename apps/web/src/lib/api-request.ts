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
 * Resolves a relative API path into something `fetch` can use here.
 *
 * @remarks
 * In the browser a relative URL is already right: the dev server proxies `/api`
 * and a deployment serves both from one host. The SSR render has neither. It has
 * no origin to resolve against, and the cookie that arrived with the page is not
 * attached to a request the server makes on its own behalf, so both are supplied
 * here rather than at every call site.
 *
 * `DOLSHOE_API_ORIGIN` deliberately carries no `VITE_` prefix. That prefix would
 * inline it into the client bundle, publishing an address that is usually only
 * reachable from inside the deployment.
 */
async function resolveRequest(path: string, init?: RequestInit): Promise<[string, RequestInit]> {
  if (!import.meta.env.SSR) return [path, init ?? {}];

  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const origin = process.env.DOLSHOE_API_ORIGIN ?? "http://localhost:3000";
  const cookie = getRequestHeader("cookie");

  return [
    new URL(path, origin).toString(),
    {
      ...init,
      headers: { ...init?.headers, ...(cookie == null ? {} : { cookie }) },
    },
  ];
}

/**
 * Sends a signed-out browser to sign in again.
 *
 * @remarks
 * A hard navigation rather than a router redirect, because it has to re-run the
 * root load that decides who the caller is. Centralized here so a session that
 * expires mid-visit is handled once, instead of in every leaf's error branch
 * where one could quietly be forgotten.
 */
function redirectToSignIn(): void {
  if (import.meta.env.SSR || typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;

  const redirect = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`);
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
  const [resolvedUrl, resolvedInit] = await resolveRequest(url, init);

  let response: Response;
  try {
    response = await fetch(resolvedUrl, resolvedInit);
  } catch (cause) {
    throw new ApiError(`Could not reach ${url} to ${operation}.`, { operation, url, cause });
  }

  if (response.status === 401) {
    redirectToSignIn();
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
