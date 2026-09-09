import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { CurrentOrganization, OrganizationContext } from "../organizations/current-organization";
import { OrgMembershipGuard } from "../organizations/org-membership.guard";
import { OWNER_OR_ADMIN, RequireOrgRole } from "../organizations/require-org-role";
import { projectIdParamSchema } from "../projects/project.contract";
import {
  AlertRule,
  AlertRuleListResponse,
  CreateAlertRuleRequest,
  UpdateAlertRuleRequest,
  alertRuleIdParamSchema,
  createAlertRuleRequestSchema,
  updateAlertRuleRequestSchema,
} from "./alert.contract";
import { AlertRuleService } from "./alert-rule.service";

const projectIdPipe = new ZodValidationPipe(projectIdParamSchema, "The project id is not a UUID.");
const ruleIdPipe = new ZodValidationPipe(
  alertRuleIdParamSchema,
  "The alert rule id is not a UUID.",
);
const createPipe = new ZodValidationPipe(
  createAlertRuleRequestSchema,
  "Request body does not match the alert rule contract.",
);
const updatePipe = new ZodValidationPipe(
  updateAlertRuleRequestSchema,
  "Request body does not match the alert rule contract.",
);

/**
 * A project's alert rules: reading is open to any member; creating,
 * updating, and deleting one need the owner or admin role, the same bar
 * project creation and renaming already sit at.
 */
@ApiTags("Alerts")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({
  description: "No such organization or project, or the caller is not a member.",
})
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug/projects/:projectId/alert-rules", version: "1" })
export class AlertController {
  constructor(private readonly alertRuleService: AlertRuleService) {}

  @Get()
  @ApiOkResponse({
    description: "The project's alert rules.",
    schema: { $ref: "#/components/schemas/AlertRuleListResponseV1" },
  })
  list(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
  ): Promise<AlertRuleListResponse> {
    return this.alertRuleService.list(organization.id, projectId);
  }

  @Post()
  @RequireOrgRole(OWNER_OR_ADMIN)
  @ApiBody({ schema: { $ref: "#/components/schemas/CreateAlertRuleRequestV1" } })
  @ApiCreatedResponse({
    description: "The alert rule was created.",
    schema: { $ref: "#/components/schemas/AlertRuleV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the alert rule contract." })
  @ApiForbiddenResponse({ description: "Creating an alert rule requires the owner or admin role." })
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Body(createPipe) request: CreateAlertRuleRequest,
  ): Promise<AlertRule> {
    return this.alertRuleService.create(organization.id, projectId, request);
  }

  /**
   * Renames a rule, enables/disables it, or both. Its condition and
   * channels are not editable here — delete and recreate the rule instead.
   */
  @Patch(":ruleId")
  @RequireOrgRole(OWNER_OR_ADMIN)
  @ApiBody({ schema: { $ref: "#/components/schemas/UpdateAlertRuleRequestV1" } })
  @ApiOkResponse({
    description: "The alert rule was updated.",
    schema: { $ref: "#/components/schemas/AlertRuleV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the alert rule contract." })
  @ApiForbiddenResponse({ description: "Updating an alert rule requires the owner or admin role." })
  @ApiNotFoundResponse({ description: "No such alert rule in this project." })
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Param("ruleId", ruleIdPipe) ruleId: string,
    @Body(updatePipe) request: UpdateAlertRuleRequest,
  ): Promise<AlertRule> {
    return this.alertRuleService.update(organization.id, projectId, ruleId, request);
  }

  @Delete(":ruleId")
  @RequireOrgRole(OWNER_OR_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "The alert rule no longer exists." })
  @ApiForbiddenResponse({ description: "Deleting an alert rule requires the owner or admin role." })
  @ApiNotFoundResponse({ description: "No such alert rule in this project." })
  delete(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Param("ruleId", ruleIdPipe) ruleId: string,
  ): Promise<void> {
    return this.alertRuleService.delete(organization.id, projectId, ruleId);
  }
}
