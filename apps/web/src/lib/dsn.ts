/**
 * Builds the DSN an application pastes into `Dolshoe.init()`.
 *
 * @remarks
 * The host comes from the browser's own origin rather than the API, because
 * behind a reverse proxy the server does not reliably know the address callers
 * reach it on — deriving one from `Host` or `X-Forwarded-*` tends to produce an
 * internal hostname. The origin the operator is currently browsing is right for
 * the compose setup and for ordinary deployments; where reporters reach Dolshoe
 * on a different address, the host is the one part they need to change.
 */
export function buildProjectDsn(projectId: string, token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = new URL(origin === "" ? "https://dolshoe.example" : origin);

  return `${url.protocol}//${token}@${url.host}${url.pathname.replace(/\/$/, "")}/${projectId}`;
}
