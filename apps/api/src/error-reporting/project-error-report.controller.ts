import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { IngestAuthGuard } from "../ingestion/ingest-auth.guard";
import { IngestProject, IngestedProject } from "../ingestion/ingested-project";
import {
  ErrorReportReceipt,
  ErrorReportRequest,
  errorReportRequestSchema,
} from "./error-report.contract";
import { nodeErrorReportExample, pythonErrorReportExample } from "./error-report.examples";
import { ErrorReportService } from "./error-report.service";
import { ZodValidationPipe } from "./zod-validation.pipe";

/**
 * The project-scoped ingestion route a DSN points at.
 *
 * @remarks
 * The path addresses a project; it does not authorize one. The project is still
 * resolved from the presented token, and `IngestAuthGuard` refuses the request
 * when the two disagree — including when the path is not a project id at all,
 * since nothing can equal a project that does not exist. Reports posted here are
 * stored exactly as those posted to the unscoped `/api/v1/error-reports`.
 */
@ApiTags("Error reporting")
@ApiBearerAuth("ingest-token")
@ApiParam({ name: "projectId", description: "The project the presented token belongs to." })
@Controller({ path: "projects/:projectId/error-reports", version: "1" })
export class ProjectErrorReportController {
  constructor(private readonly errorReportService: ErrorReportService) {}

  /**
   * Receive a normalized error report for the project named in the path.
   *
   * @returns The server identifier and the timestamp at which the event was first received.
   */
  @Post()
  @UseGuards(IngestAuthGuard)
  @ApiBody({
    schema: { $ref: "#/components/schemas/ErrorReportRequestV1" },
    examples: {
      node: { summary: "Node.js unhandled rejection", value: nodeErrorReportExample },
      python: { summary: "Python exception group", value: pythonErrorReportExample },
    },
  })
  @ApiCreatedResponse({
    description: "The report was accepted, or a prior receipt was found for the same eventId.",
    schema: { $ref: "#/components/schemas/ErrorReportReceiptV1" },
  })
  @ApiBadRequestResponse({
    description: "The body does not satisfy the versioned error report contract.",
  })
  @ApiUnauthorizedResponse({ description: "The ingestion bearer token is missing or invalid." })
  @ApiForbiddenResponse({ description: "The token does not belong to the project in the path." })
  receive(
    @Body(new ZodValidationPipe(errorReportRequestSchema)) report: ErrorReportRequest,
    @IngestProject() project: IngestedProject,
  ): Promise<ErrorReportReceipt> {
    return this.errorReportService.receive(report, project.id);
  }
}
