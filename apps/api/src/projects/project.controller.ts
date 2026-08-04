import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";

import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
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
 * Manages projects and the ingestion tokens issued for them.
 *
 * @remarks
 * Unauthenticated, like `GET /api/v1/error-reports`: Dolshoe has no viewer-auth
 * system yet. Unlike that endpoint these routes grant write access — anyone who
 * can reach them can mint a token for any project — so an instance exposing this
 * API must keep it on a trusted network.
 */
@ApiTags("Projects")
@Controller({ path: "projects", version: "1" })
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
  list(): Promise<ProjectListResponse> {
    return this.projectService.list();
  }

  /**
   * Create a project.
   *
   * @remarks
   * The slug is derived from the name when it is omitted.
   */
  @Post()
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
  create(
    @Body(
      new ZodValidationPipe(
        createProjectRequestSchema,
        "Request body does not match the project contract.",
      ),
    )
    request: CreateProjectRequest,
  ): Promise<Project> {
    return this.projectService.create(request);
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
    @Param("projectId", projectIdPipe) projectId: string,
  ): Promise<ProjectTokenListResponse> {
    return this.projectService.listTokens(projectId);
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
  @ApiBody({
    schema: { $ref: "#/components/schemas/IssueProjectTokenRequestV1" },
    examples: { production: { summary: "Production reporter", value: issueProjectTokenExample } },
  })
  @ApiCreatedResponse({
    description: "The token was issued. Its plaintext value is returned exactly once.",
    schema: { $ref: "#/components/schemas/IssuedProjectTokenV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the token contract." })
  @ApiNotFoundResponse({ description: "No such project." })
  issueToken(
    @Param("projectId", projectIdPipe) projectId: string,
    @Body(
      new ZodValidationPipe(
        issueProjectTokenRequestSchema,
        "Request body does not match the ingestion token contract.",
      ),
    )
    request: IssueProjectTokenRequest,
  ): Promise<IssuedProjectToken> {
    return this.projectService.issueToken(projectId, request);
  }

  /**
   * Revoke an ingestion token.
   *
   * @remarks
   * Idempotent: revoking an already-revoked token returns its original
   * revocation timestamp.
   */
  @Post(":projectId/tokens/:tokenId/revoke")
  // Revoking updates an existing token rather than creating one, so this is not
  // a 201 despite being a POST.
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: "The token is revoked and can no longer authenticate an ingest.",
    schema: { $ref: "#/components/schemas/ProjectTokenV1" },
  })
  @ApiBadRequestResponse({ description: "The project or token id is not a UUID." })
  @ApiNotFoundResponse({ description: "No such token in that project." })
  revokeToken(
    @Param("projectId", projectIdPipe) projectId: string,
    @Param("tokenId", new ZodValidationPipe(projectIdParamSchema, "The token id is not a UUID."))
    tokenId: string,
  ): Promise<ProjectToken> {
    return this.projectService.revokeToken(projectId, tokenId);
  }
}
