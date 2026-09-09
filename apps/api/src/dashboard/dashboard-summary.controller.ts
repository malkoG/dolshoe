import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CurrentOrganization, OrganizationContext } from "../organizations/current-organization";
import { OrgMembershipGuard } from "../organizations/org-membership.guard";
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { projectIdParamSchema } from "../projects/project.contract";
import { ProjectDashboardSummary } from "./dashboard-summary.contract";
import { DashboardSummaryService } from "./dashboard-summary.service";

const projectIdPipe = new ZodValidationPipe(projectIdParamSchema, "The project id is not a UUID.");

/**
 * Aggregated project activity for the dashboard's first screen.
 *
 * @remarks
 * A read model, not a new source of truth: every number here is recomputed
 * from `ErrorReport`, `LogRecord`, and `Span` on each request. There is
 * nothing yet to invalidate.
 */
@ApiTags("Dashboard")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({ description: "No such organization, or the caller is not a member." })
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug/projects/:projectId/dashboard-summary", version: "1" })
export class DashboardSummaryController {
  constructor(private readonly dashboardSummaryService: DashboardSummaryService) {}

  @Get()
  @ApiOkResponse({
    description: "Aggregated error report, log, and trace activity over a fixed trailing window.",
    schema: { $ref: "#/components/schemas/ProjectDashboardSummaryV1" },
  })
  @ApiBadRequestResponse({ description: "The project id is not a UUID." })
  @ApiNotFoundResponse({
    description: "No such project in this organization, or the caller is not a member.",
  })
  summarize(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
  ): Promise<ProjectDashboardSummary> {
    return this.dashboardSummaryService.summarize(organization.id, projectId);
  }
}
