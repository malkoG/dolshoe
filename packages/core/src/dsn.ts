export interface ParsedDsn {
  /** Scheme and authority, without a trailing slash. */
  readonly origin: string;
  /** Path the instance is mounted under, or an empty string. Never trailing-slashed. */
  readonly basePath: string;
  readonly projectId: string;
  readonly token: string;
  readonly errorReportEndpoint: string;
  readonly logEndpoint: string;
}

/**
 * A DSN packages everything a reporter needs into one copyable string:
 *
 * ```
 * https://<token>@dolshoe.example/<projectId>
 * ```
 *
 * The token sits in the userinfo position, so a DSN is a secret — unlike a
 * Sentry DSN, whose ingestion endpoint is open. Segments before the last one are
 * treated as a base path, which is what lets an instance served under a prefix
 * work without configuring endpoints by hand.
 */
export function parseDsn(dsn: string): ParsedDsn {
  const trimmed = dsn.trim();
  if (trimmed.length === 0) {
    throw new Error("Dolshoe dsn must not be empty.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Dolshoe dsn is not a valid URL: ${JSON.stringify(dsn)}.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `Dolshoe dsn must use http or https, but got ${JSON.stringify(url.protocol.replace(":", ""))}.`,
    );
  }

  if (url.password !== "") {
    throw new Error("Dolshoe dsn carries the ingestion token alone; it has no password component.");
  }

  const token = decodeURIComponent(url.username);
  if (token === "") {
    throw new Error(
      "Dolshoe dsn is missing its ingestion token. Expected https://<token>@<host>/<projectId>.",
    );
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const projectId = segments.pop();
  if (projectId == null) {
    throw new Error(
      "Dolshoe dsn is missing its project id. Expected https://<token>@<host>/<projectId>.",
    );
  }

  const basePath = segments.length === 0 ? "" : `/${segments.join("/")}`;
  const origin = `${url.protocol}//${url.host}`;
  const projectPath = `${origin}${basePath}/api/v1/projects/${encodeURIComponent(projectId)}`;

  return {
    origin,
    basePath,
    projectId,
    token,
    errorReportEndpoint: `${projectPath}/error-reports`,
    logEndpoint: `${projectPath}/log-records`,
  };
}
