import { Global, Module } from "@nestjs/common";

import { OrgMembershipGuard } from "./org-membership.guard";
import { OrganizationController, OrganizationMemberController } from "./organization.controller";
import { OrganizationService } from "./organization.service";

/**
 * Global for the same reason `AuthModule` and `IngestionModule` are:
 * `@UseGuards(OrgMembershipGuard)` constructs the guard inside whichever module
 * declares the route, so its dependencies have to be resolvable there. Projects,
 * error reports, and log records all guard their routes with it.
 */
@Global()
@Module({
  controllers: [OrganizationController, OrganizationMemberController],
  providers: [OrganizationService, OrgMembershipGuard],
  exports: [OrganizationService, OrgMembershipGuard],
})
export class OrganizationModule {}
