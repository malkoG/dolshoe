import { ForbiddenException } from "@nestjs/common";

export interface OriginCheckableRequest {
  method?: string;
  headers: { origin?: string | string[]; host?: string | string[] };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Refuses a state-changing request that a different site initiated.
 *
 * @remarks
 * The session cookie is `SameSite=Lax`, which already keeps it off cross-site
 * writes in every current browser. This is the second lock: if an `Origin`
 * header is present it has to name this host.
 *
 * A missing `Origin` is allowed. Browsers always send it on cross-site requests,
 * so its absence means the caller is not a browser — curl, a script, the e2e
 * suite — and those are not the thing CSRF describes. Rejecting them instead
 * would break every non-browser client to defend against an attack they cannot
 * carry out.
 */
export function assertSameOrigin(request: OriginCheckableRequest): void {
  if (SAFE_METHODS.has((request.method ?? "GET").toUpperCase())) return;

  const { origin, host } = request.headers;

  // Repeated headers are refused rather than resolved. There is no correct way
  // to pick one, and treating the pair as "no origin" would turn a duplicate
  // header into a way around the check.
  if (Array.isArray(origin) || Array.isArray(host)) {
    throw new ForbiddenException("Cross-origin request refused.");
  }

  if (origin == null) return;

  if (host == null || parseOriginHost(origin) !== host) {
    throw new ForbiddenException("Cross-origin request refused.");
  }
}

function parseOriginHost(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}
