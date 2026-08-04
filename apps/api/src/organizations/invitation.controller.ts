import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CurrentViewer, Viewer } from "../auth/viewer";
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { CurrentOrganization, OrganizationContext } from "./current-organization";
import { InvitationService } from "./invitation.service";
import { OrgMembershipGuard } from "./org-membership.guard";
import {
  CreateInvitationRequest,
  Invitation,
  InvitationListResponse,
  IssuedInvitation,
  createInvitationRequestSchema,
  invitationIdParamSchema,
} from "./organization.contract";
import { createInvitationExample } from "./organization.examples";
import { OWNER_OR_ADMIN, RequireOrgRole } from "./require-org-role";

const invitationIdPipe = new ZodValidationPipe(
  invitationIdParamSchema,
  "The invitation id is not a UUID.",
);

/**
 * Inviting people into an organization.
 *
 * @remarks
 * Administering membership is an owner-or-admin action throughout, including
 * seeing who has been invited: the list names GitHub accounts that have not
 * joined yet, which is not something every member needs.
 */
@ApiTags("Organizations")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({ description: "No such organization, or the caller is not a member." })
@ApiForbiddenResponse({ description: "Managing invitations requires the owner or admin role." })
@RequireOrgRole(OWNER_OR_ADMIN)
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug/invitations", version: "1" })
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  /**
   * List the organization's invitations, newest first.
   */
  @Get()
  @ApiOkResponse({
    description: "Newest-first invitations, without their tokens.",
    schema: { $ref: "#/components/schemas/InvitationListResponseV1" },
  })
  list(@CurrentOrganization() organization: OrganizationContext): Promise<InvitationListResponse> {
    return this.invitationService.list(organization.id);
  }

  /**
   * Invite someone.
   *
   * @remarks
   * The response carries the one-time link. It is the only time the server can
   * produce it — only a digest is stored — and Dolshoe sends no email, so the
   * caller has to deliver it themselves.
   */
  @Post()
  @ApiBody({
    schema: { $ref: "#/components/schemas/CreateInvitationRequestV1" },
    examples: { colleague: { summary: "Invite a colleague", value: createInvitationExample } },
  })
  @ApiCreatedResponse({
    description: "The invitation was created. Its link is returned exactly once.",
    schema: { $ref: "#/components/schemas/IssuedInvitationV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the invitation contract." })
  @ApiConflictResponse({ description: "That GitHub account already belongs to this organization." })
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @CurrentViewer() viewer: Viewer,
    @Body(
      new ZodValidationPipe(
        createInvitationRequestSchema,
        "Request body does not match the invitation contract.",
      ),
    )
    request: CreateInvitationRequest,
  ): Promise<IssuedInvitation> {
    return this.invitationService.create(organization.id, viewer.id, request);
  }

  /**
   * Withdraw an invitation.
   *
   * @remarks
   * Idempotent: revoking an already-revoked invitation returns its original
   * revocation timestamp.
   */
  @Post(":invitationId/revoke")
  // Revoking updates an existing invitation rather than creating one, so this is
  // not a 201 despite being a POST.
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: "The invitation can no longer be accepted.",
    schema: { $ref: "#/components/schemas/InvitationV1" },
  })
  @ApiNotFoundResponse({ description: "No such invitation in that organization." })
  revoke(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("invitationId", invitationIdPipe) invitationId: string,
  ): Promise<Invitation> {
    return this.invitationService.revoke(organization.id, invitationId);
  }
}
