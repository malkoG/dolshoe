import { Global, Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GitHubOAuthClient } from "./github-oauth.client";
import { InstanceClaimReadinessService } from "./instance-claim-readiness.service";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";

/**
 * Global for the same reason `IngestionModule` is: `@UseGuards(SessionAuthGuard)`
 * constructs the guard inside whichever module declares the route, so
 * `SessionService` has to be resolvable everywhere the guard can be used.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    GitHubOAuthClient,
    SessionService,
    SessionAuthGuard,
    InstanceClaimReadinessService,
  ],
  exports: [AuthService, SessionService, SessionAuthGuard],
})
export class AuthModule {}
