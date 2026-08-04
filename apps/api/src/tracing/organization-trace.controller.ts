import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { CurrentOrganization, OrganizationContext } from "../organizations/current-organization";
import { OrgMembershipGuard } from "../organizations/org-membership.guard";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { projectIdParamSchema } from "../projects/project.contract";
import { TraceDetailResponse, TraceListResponse, traceIdParamSchema } from "./trace.contract";
import { TraceService } from "./trace.service";

const projectIdPipe = new ZodValidationPipe(projectIdParamSchema, "The project id is not a UUID.");
const traceIdPipe = new ZodValidationPipe(
  traceIdParamSchema,
  "The trace id is not a 16-byte hex identifier.",
);

/**
 * Reading a project's traces.
 *
 * @remarks
 * No query parameters. The logs listing needs a server-side severity filter
 * because filtering its bounded page in the browser would only ever narrow the
 * newest hundred records; here each summary already carries `errorSpanCount`, so
 * an "errors only" toggle is correct in the browser. A server-side status filter
 * would also be quietly wrong — it would match on the root span, hiding a trace
 * whose root succeeded and whose child failed, which is the case worth finding.
 */
@ApiTags("Tracing")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({ description: "No such organization, or the caller is not a member." })
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug/projects/:projectId/traces", version: "1" })
export class OrganizationTraceController {
  constructor(private readonly traceService: TraceService) {}

  /**
   * List the project's most recent traces, newest first.
   */
  @Get()
  @ApiOkResponse({
    description: "Newest-first traces, bounded to the documented limit.",
    schema: { $ref: "#/components/schemas/TraceListResponseV1" },
  })
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
  ): Promise<TraceListResponse> {
    return this.traceService.list(organization.id, projectId);
  }

  /**
   * Read one trace and every span stored for it.
   *
   * @remarks
   * Spans come back depth-first, parents before children, each carrying its
   * depth and its offset from the trace's start — everything a waterfall needs
   * without the client rebuilding the tree.
   */
  @Get(":traceId")
  @ApiOkResponse({
    description: "The trace, and its spans in the order a waterfall draws them.",
    schema: { $ref: "#/components/schemas/TraceDetailResponseV1" },
  })
  @ApiBadRequestResponse({ description: "The trace id is not a 16-byte hex identifier." })
  detail(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Param("traceId", traceIdPipe) traceId: string,
  ): Promise<TraceDetailResponse> {
    return this.traceService.detail(organization.id, projectId, traceId);
  }
}
