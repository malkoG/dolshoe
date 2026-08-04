import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { OriginCheckableRequest, assertSameOrigin } from "./same-origin";

/**
 * Applies the same-origin check to routes that have no session yet.
 *
 * @remarks
 * `SessionAuthGuard` already performs this check for everything it protects, but
 * signing in and registering happen before a session exists and are exactly the
 * requests an attacker would want to forge — a cross-site sign-in as an account
 * they control leaves the victim's browser logged in as someone else.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertSameOrigin(context.switchToHttp().getRequest<OriginCheckableRequest>());
    return true;
  }
}
