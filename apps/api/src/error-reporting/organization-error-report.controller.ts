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
import { projectIdParamSchema } from "../projects/project.contract";
import { ErrorReportListResponse } from "./error-report.contract";
import { ErrorReportService } from "./error-report.service";
import { ZodValidationPipe } from "./zod-validation.pipe";

const projectIdPipe = new ZodValidationPipe(projectIdParamSchema, "The project id is not a UUID.");

/**
 * Reading a project's error reports.
 *
 * @remarks
 * The project used to be an optional `?projectId=` filter on an open endpoint.
 * It is a path segment now, under the organization that owns it, so that one
 * guard settles both who is asking and what they are allowed to see. Any member
 * may read; there is no role above that for looking at recorded events.
 */
@ApiTags("Error reporting")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({ description: "No such organization, or the caller is not a member." })
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug/projects/:projectId/error-reports", version: "1" })
export class OrganizationErrorReportController {
  constructor(private readonly errorReportService: ErrorReportService) {}

  /**
   * List the project's most recently received error reports.
   */
  @Get()
  @ApiOkResponse({
    description: "Newest-first error report summaries, bounded to the documented limit.",
    schema: { $ref: "#/components/schemas/ErrorReportListResponseV1" },
  })
  @ApiBadRequestResponse({ description: "The project id is not a UUID." })
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
  ): Promise<ErrorReportListResponse> {
    return this.errorReportService.list(organization.id, projectId);
  }
}
