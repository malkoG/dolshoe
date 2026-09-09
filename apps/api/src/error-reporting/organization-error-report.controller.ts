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
import { CurrentOrganization, OrganizationContext } from "../organizations/current-organization";
import { OrgMembershipGuard } from "../organizations/org-membership.guard";
import { projectIdParamSchema } from "../projects/project.contract";
import {
  ErrorReportDetail,
  ErrorReportListQuery,
  ErrorReportListResponse,
  errorReportIdParamSchema,
  errorReportListQuerySchema,
} from "./error-report.contract";
import { ErrorReportService } from "./error-report.service";
import { ZodValidationPipe } from "./zod-validation.pipe";

const projectIdPipe = new ZodValidationPipe(projectIdParamSchema, "The project id is not a UUID.");
const reportIdPipe = new ZodValidationPipe(
  errorReportIdParamSchema,
  "The error report id is not a UUID.",
);
const listQueryPipe = new ZodValidationPipe(
  errorReportListQuerySchema,
  "Provide both tagKey and tagValue, or neither.",
);

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
   *
   * @remarks
   * `tagKey`/`tagValue` and `userId` narrow the same project-scoped,
   * time-ordered result server-side — the list is bounded, so filtering it in
   * the browser would only ever narrow whatever page happened to load.
   */
  @Get()
  @ApiQuery({ name: "tagKey", required: false })
  @ApiQuery({ name: "tagValue", required: false })
  @ApiQuery({ name: "userId", required: false })
  @ApiOkResponse({
    description: "Newest-first error report summaries, bounded to the documented limit.",
    schema: { $ref: "#/components/schemas/ErrorReportListResponseV1" },
  })
  @ApiBadRequestResponse({
    description: "The project id is not a UUID, or tagKey/tagValue was given without the other.",
  })
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Query(listQueryPipe) query: ErrorReportListQuery,
  ): Promise<ErrorReportListResponse> {
    return this.errorReportService.list(organization.id, projectId, query);
  }

  /**
   * Read one report in full, including every stack frame the reporter sent.
   *
   * @remarks
   * The list deliberately returns a summary — fifty reports each carrying up to
   * two hundred frames is a response nobody wants. Frames are what an
   * investigation is actually for, so they live here, one report at a time.
   */
  @Get(":reportId")
  @ApiOkResponse({
    description: "The stored report, with its whole exception tree.",
    schema: { $ref: "#/components/schemas/ErrorReportDetailV1" },
  })
  @ApiBadRequestResponse({ description: "The project id or report id is not a UUID." })
  @ApiNotFoundResponse({
    description: "No such report in this project, or the caller is not a member.",
  })
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Param("reportId", reportIdPipe) reportId: string,
  ): Promise<ErrorReportDetail> {
    return this.errorReportService.get(organization.id, projectId, reportId);
  }
}
