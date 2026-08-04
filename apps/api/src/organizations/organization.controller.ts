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
  ApiConflictResponse,
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
import { CurrentViewer, Viewer } from "../auth/viewer";
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { CurrentOrganization, OrganizationContext } from "./current-organization";
import { OrgMembershipGuard } from "./org-membership.guard";
import {
  CreateOrganizationRequest,
  Member,
  MemberListResponse,
  Organization,
  OrganizationListResponse,
  UpdateMemberRequest,
  createOrganizationRequestSchema,
  updateMemberRequestSchema,
  userIdParamSchema,
} from "./organization.contract";
import { createOrganizationExample, updateMemberExample } from "./organization.examples";
import { OrganizationService } from "./organization.service";
import { OWNER_OR_ADMIN, RequireOrgRole } from "./require-org-role";

const userIdPipe = new ZodValidationPipe(userIdParamSchema, "The user id is not a UUID.");

/**
 * The organizations a viewer belongs to, and creating new ones.
 *
 * @remarks
 * These two routes cannot use `OrgMembershipGuard`: one lists organizations
 * before any is chosen, and the other creates the organization that would
 * otherwise have to already exist.
 */
@ApiTags("Organizations")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@UseGuards(SessionAuthGuard)
@Controller({ path: "orgs", version: "1" })
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * List the organizations the caller belongs to.
   */
  @Get()
  @ApiOkResponse({
    description: "Newest-first organizations the viewer is a member of.",
    schema: { $ref: "#/components/schemas/OrganizationListResponseV1" },
  })
  list(@CurrentViewer() viewer: Viewer): Promise<OrganizationListResponse> {
    return this.organizationService.listForViewer(viewer.id);
  }

  /**
   * Create an organization.
   *
   * @remarks
   * The caller becomes its owner. The slug is derived from the name when it is
   * omitted, and is unique across the instance because it appears in URLs with
   * nothing above it to disambiguate.
   */
  @Post()
  @ApiBody({
    schema: { $ref: "#/components/schemas/CreateOrganizationRequestV1" },
    examples: { acme: { summary: "Acme Payments", value: createOrganizationExample } },
  })
  @ApiCreatedResponse({
    description: "The organization was created, owned by the caller.",
    schema: { $ref: "#/components/schemas/OrganizationV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the organization contract." })
  @ApiConflictResponse({ description: "Another organization already uses that slug." })
  create(
    @CurrentViewer() viewer: Viewer,
    @Body(
      new ZodValidationPipe(
        createOrganizationRequestSchema,
        "Request body does not match the organization contract.",
      ),
    )
    request: CreateOrganizationRequest,
  ): Promise<Organization> {
    return this.organizationService.create(viewer.id, request);
  }
}

/**
 * One organization and the people in it.
 *
 * @remarks
 * Every route here resolves its organization from the path and refuses a caller
 * who is not a member — as a 404, so an organization somebody else owns is
 * indistinguishable from one that does not exist.
 */
@ApiTags("Organizations")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({ description: "No such organization, or the caller is not a member." })
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug", version: "1" })
export class OrganizationMemberController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * Describe one organization.
   */
  @Get()
  @ApiOkResponse({
    description: "The organization, with the caller's role in it.",
    schema: { $ref: "#/components/schemas/OrganizationV1" },
  })
  describe(@CurrentOrganization() organization: OrganizationContext): Organization {
    // Already resolved by the guard, which had to load it to authorize the
    // request. Reading it again would be a second query for the same row.
    return {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: organization.role,
      createdAt: organization.createdAt.toISOString(),
    };
  }

  /**
   * List everyone in the organization.
   */
  @Get("members")
  @ApiOkResponse({
    description: "Members, oldest first.",
    schema: { $ref: "#/components/schemas/MemberListResponseV1" },
  })
  listMembers(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<MemberListResponse> {
    return this.organizationService.listMembers(organization.id);
  }

  /**
   * Change a member's role.
   *
   * @remarks
   * Only an owner may grant or withdraw ownership, and the last owner cannot be
   * demoted — an organization with no owner could not be administered by anyone.
   */
  @Patch("members/:userId")
  @RequireOrgRole(OWNER_OR_ADMIN)
  @ApiBody({
    schema: { $ref: "#/components/schemas/UpdateMemberRequestV1" },
    examples: { promote: { summary: "Promote to admin", value: updateMemberExample } },
  })
  @ApiOkResponse({
    description: "The member's role was changed.",
    schema: { $ref: "#/components/schemas/MemberV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the membership contract." })
  @ApiForbiddenResponse({ description: "The caller's role does not permit this change." })
  @ApiConflictResponse({ description: "This is the organization's last owner." })
  updateMember(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("userId", userIdPipe) userId: string,
    @Body(
      new ZodValidationPipe(
        updateMemberRequestSchema,
        "Request body does not match the membership contract.",
      ),
    )
    request: UpdateMemberRequest,
  ): Promise<Member> {
    return this.organizationService.updateMemberRole(
      organization.id,
      organization.role,
      userId,
      request.role,
    );
  }

  /**
   * Remove someone from the organization.
   *
   * @remarks
   * Their sessions stay valid — they are still signed in — but every route in
   * this organization stops resolving for them immediately, because membership
   * is read on each request rather than baked into the session.
   */
  @Delete("members/:userId")
  @RequireOrgRole(OWNER_OR_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "The member no longer belongs to the organization." })
  @ApiForbiddenResponse({ description: "The caller's role does not permit this removal." })
  @ApiConflictResponse({ description: "This is the organization's last owner." })
  removeMember(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("userId", userIdPipe) userId: string,
  ): Promise<void> {
    return this.organizationService.removeMember(organization.id, organization.role, userId);
  }
}
