import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { OriginCheckableRequest, assertSameOrigin } from "./same-origin";
import { readSessionCookie } from "./session-cookie";
import { parseSessionTokenPrefix } from "./session-token";
import { SessionService } from "./session.service";
import { attachViewer } from "./viewer";

interface SessionRequest extends OriginCheckableRequest {
  headers: { cookie?: string | string[]; origin?: string | string[]; host?: string | string[] };
}

/**
 * Authenticates a viewer from the session cookie and attaches who they are.
 *
 * @remarks
 * Dolshoe has two credential systems, and four things keep either from ever
 * satisfying the other:
 *
 * 1. Transport. A session is read only from the `Cookie` header; an ingestion
 *    token only from `Authorization`. Neither guard looks at the other's.
 * 2. Scheme. `dsv_` against `dsh_`, so each parser rejects the other's
 *    credential before any database access.
 * 3. Storage. `Session` and `ProjectToken` are different tables reached by
 *    different queries; no lookup could return the wrong kind of row.
 * 4. Route sets are disjoint. No handler carries both guards.
 *
 * The same-origin check lives here rather than in its own layer because CSRF is
 * only a risk where an ambient credential is accepted. Binding the two together
 * means no route can pick up the session without also picking up the defence.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();

    assertSameOrigin(request);

    const cookie = request.headers.cookie;
    const raw = readSessionCookie(Array.isArray(cookie) ? cookie.join("; ") : cookie);

    if (raw == null) {
      throw new UnauthorizedException("A signed-in session is required.");
    }

    // An ingestion token presented in the session cookie parses as nothing and
    // is refused here, without a lookup that might otherwise be tempted to find
    // it.
    const prefix = parseSessionTokenPrefix(raw);
    if (prefix == null) {
      throw new UnauthorizedException("A signed-in session is required.");
    }

    attachViewer(request, await this.sessionService.verify(raw, prefix));
    return true;
  }
}
