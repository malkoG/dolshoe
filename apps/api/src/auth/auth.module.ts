import { Global, Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GitHubOAuthClient } from "./github-oauth.client";
import { InstanceClaimReadinessService } from "./instance-claim-readiness.service";
import { MockLoginController } from "./mock-login.controller";
import { MockLoginReadinessService } from "./mock-login.readiness.service";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";

/**
 * Global for the same reason `IngestionModule` is: `@UseGuards(SessionAuthGuard)`
 * constructs the guard inside whichever module declares the route, so
 * `SessionService` has to be resolvable everywhere the guard can be used.
 */
@Global()
@Module({
  // `MockLoginController` is registered unconditionally and refuses per request,
  // so that an instance without `MOCK_LOGIN` answers 404 — the same thing a
  // caller would see if the route did not exist — and tests can flip the flag.
  controllers: [AuthController, MockLoginController],
  providers: [
    AuthService,
    GitHubOAuthClient,
    SessionService,
    SessionAuthGuard,
    InstanceClaimReadinessService,
    MockLoginReadinessService,
  ],
  exports: [AuthService, SessionService, SessionAuthGuard],
})
export class AuthModule {}
