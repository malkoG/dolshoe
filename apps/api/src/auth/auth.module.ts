import { Global, Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { InstanceClaimReadinessService } from "./instance-claim-readiness.service";
import { SameOriginGuard } from "./same-origin.guard";
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
    SessionService,
    SessionAuthGuard,
    SameOriginGuard,
    InstanceClaimReadinessService,
  ],
  exports: [AuthService, SessionService, SessionAuthGuard, SameOriginGuard],
})
export class AuthModule {}
