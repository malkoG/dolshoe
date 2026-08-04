import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { CurrentOrganization, OrganizationContext } from "../organizations/current-organization";
import { OrgMembershipGuard } from "../organizations/org-membership.guard";
import { projectIdParamSchema } from "../projects/project.contract";
import { LogRecordListQuery, LogRecordListResponse } from "./log-record.contract";
import { logRecordListQuerySchema } from "./log-record.contract";
import { LogRecordService } from "./log-record.service";

const projectIdPipe = new ZodValidationPipe(projectIdParamSchema, "The project id is not a UUID.");

/**
 * Reading a project's structured logs.
 *
 * @remarks
 * The project moved from a required `?projectId=` parameter into the path, under
 * the organization that owns it, leaving severity as the only thing the query
 * string still asks for.
 */
@ApiTags("Log recording")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({ description: "No such organization, or the caller is not a member." })
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug/projects/:projectId/log-records", version: "1" })
export class OrganizationLogRecordController {
  constructor(private readonly logRecordService: LogRecordService) {}

  /**
   * List the project's most recently received log records.
   */
  @Get()
  @ApiQuery({ name: "level", required: false, description: "Limit the listing to one severity." })
  @ApiOkResponse({
    description: "Newest-first log records, bounded to the documented limit.",
    schema: { $ref: "#/components/schemas/LogRecordListResponseV1" },
  })
  @ApiBadRequestResponse({ description: "The query does not satisfy the log listing contract." })
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Query(new ZodValidationPipe(logRecordListQuerySchema, "Invalid log record list query."))
    query: LogRecordListQuery,
  ): Promise<LogRecordListResponse> {
    return this.logRecordService.list(organization.id, projectId, query);
  }
}
