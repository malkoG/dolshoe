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
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { CurrentOrganization, OrganizationContext } from "../organizations/current-organization";
import { OrgMembershipGuard } from "../organizations/org-membership.guard";
import { OWNER_OR_ADMIN, RequireOrgRole } from "../organizations/require-org-role";
import {
  CreateProjectRequest,
  IssueProjectTokenRequest,
  IssuedProjectToken,
  Project,
  ProjectListResponse,
  ProjectToken,
  ProjectTokenListResponse,
  createProjectRequestSchema,
  issueProjectTokenRequestSchema,
  projectIdParamSchema,
} from "./project.contract";
import { createProjectExample, issueProjectTokenExample } from "./project.examples";
import { ProjectService } from "./project.service";

const projectIdPipe = new ZodValidationPipe(projectIdParamSchema, "The project id is not a UUID.");

/**
 * Manages an organization's projects and the ingestion tokens issued for them.
 *
 * @remarks
 * Every route is scoped to the organization named in its path and requires a
 * viewer with a role in it. Reading is open to any member; anything that creates
 * a project or mints a credential needs an owner or an admin.
 *
 * Ingestion does not live here. `POST /api/v1/projects/:projectId/error-reports`
 * and its log-record counterpart keep their unscoped paths and their ingestion
 * token, because SDK DSNs in the field derive those URLs.
 */
@ApiTags("Projects")
@ApiCookieAuth("session")
@ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
@ApiNotFoundResponse({ description: "No such organization, or the caller is not a member." })
@UseGuards(SessionAuthGuard, OrgMembershipGuard)
@Controller({ path: "orgs/:orgSlug/projects", version: "1" })
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  /**
   * List every project, newest first.
   */
  @Get()
  @ApiOkResponse({
    description: "Newest-first projects.",
    schema: { $ref: "#/components/schemas/ProjectListResponseV1" },
  })
  list(@CurrentOrganization() organization: OrganizationContext): Promise<ProjectListResponse> {
    return this.projectService.list(organization.id);
  }

  /**
   * Create a project.
   *
   * @remarks
   * The slug is derived from the name when it is omitted.
   */
  @Post()
  @RequireOrgRole(OWNER_OR_ADMIN)
  @ApiBody({
    schema: { $ref: "#/components/schemas/CreateProjectRequestV1" },
    examples: { checkout: { summary: "Checkout API", value: createProjectExample } },
  })
  @ApiCreatedResponse({
    description: "The project was created.",
    schema: { $ref: "#/components/schemas/ProjectV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the project contract." })
  @ApiConflictResponse({ description: "Another project already uses that slug." })
  @ApiForbiddenResponse({ description: "Creating a project requires the owner or admin role." })
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @Body(
      new ZodValidationPipe(
        createProjectRequestSchema,
        "Request body does not match the project contract.",
      ),
    )
    request: CreateProjectRequest,
  ): Promise<Project> {
    return this.projectService.create(organization.id, request);
  }

  /**
   * List a project's ingestion tokens.
   *
   * @remarks
   * Tokens are identified by their prefix. The plaintext is never returned here;
   * it exists only in the response that issued it.
   */
  @Get(":projectId/tokens")
  @ApiOkResponse({
    description: "Newest-first ingestion tokens, without their plaintext values.",
    schema: { $ref: "#/components/schemas/ProjectTokenListResponseV1" },
  })
  @ApiBadRequestResponse({ description: "The project id is not a UUID." })
  @ApiNotFoundResponse({ description: "No such project." })
  listTokens(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
  ): Promise<ProjectTokenListResponse> {
    return this.projectService.listTokens(organization.id, projectId);
  }

  /**
   * Issue an ingestion token for a project.
   *
   * @remarks
   * The response carries the token in plaintext. It is the only time the server
   * can produce it — only a SHA-256 digest is stored — so the caller has to
   * record it now.
   */
  @Post(":projectId/tokens")
  @RequireOrgRole(OWNER_OR_ADMIN)
  @ApiBody({
    schema: { $ref: "#/components/schemas/IssueProjectTokenRequestV1" },
    examples: { production: { summary: "Production reporter", value: issueProjectTokenExample } },
  })
  @ApiCreatedResponse({
    description: "The token was issued. Its plaintext value is returned exactly once.",
    schema: { $ref: "#/components/schemas/IssuedProjectTokenV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the token contract." })
  @ApiForbiddenResponse({ description: "Issuing a token requires the owner or admin role." })
  issueToken(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Body(
      new ZodValidationPipe(
        issueProjectTokenRequestSchema,
        "Request body does not match the ingestion token contract.",
      ),
    )
    request: IssueProjectTokenRequest,
  ): Promise<IssuedProjectToken> {
    return this.projectService.issueToken(organization.id, projectId, request);
  }

  /**
   * Revoke an ingestion token.
   *
   * @remarks
   * Idempotent: revoking an already-revoked token returns its original
   * revocation timestamp.
   */
  @Post(":projectId/tokens/:tokenId/revoke")
  @RequireOrgRole(OWNER_OR_ADMIN)
  // Revoking updates an existing token rather than creating one, so this is not
  // a 201 despite being a POST.
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: "The token is revoked and can no longer authenticate an ingest.",
    schema: { $ref: "#/components/schemas/ProjectTokenV1" },
  })
  @ApiBadRequestResponse({ description: "The project or token id is not a UUID." })
  @ApiForbiddenResponse({ description: "Revoking a token requires the owner or admin role." })
  revokeToken(
    @CurrentOrganization() organization: OrganizationContext,
    @Param("projectId", projectIdPipe) projectId: string,
    @Param("tokenId", new ZodValidationPipe(projectIdParamSchema, "The token id is not a UUID."))
    tokenId: string,
  ): Promise<ProjectToken> {
    return this.projectService.revokeToken(organization.id, projectId, tokenId);
  }
}
