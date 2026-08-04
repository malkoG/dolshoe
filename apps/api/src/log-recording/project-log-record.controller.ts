import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { IngestAuthGuard } from "../ingestion/ingest-auth.guard";
import { IngestProject, IngestedProject } from "../ingestion/ingested-project";
import {
  LogRecordBatchReceipt,
  LogRecordBatchRequest,
  logRecordBatchRequestSchema,
} from "./log-record.contract";
import { logRecordBatchExample } from "./log-record.examples";
import { LogRecordService } from "./log-record.service";

/**
 * The project-scoped log ingestion route a DSN points at.
 *
 * @remarks
 * As with error reports, the path addresses a project and the token authorizes
 * one; `IngestAuthGuard` refuses the request when they disagree.
 */
@ApiTags("Log recording")
@ApiBearerAuth("ingest-token")
@ApiParam({ name: "projectId", description: "The project the presented token belongs to." })
@Controller({ path: "projects/:projectId/log-records", version: "1" })
export class ProjectLogRecordController {
  constructor(private readonly logRecordService: LogRecordService) {}

  /**
   * Receive an atomic batch of structured log records for the project named in the path.
   *
   * @remarks
   * A batch contains up to 100 records. Repeating eventIds is safe and returns each record's
   * original receipt. Validation failure rejects the entire batch.
   */
  @Post()
  @UseGuards(IngestAuthGuard)
  @ApiBody({
    schema: { $ref: "#/components/schemas/LogRecordBatchRequestV1" },
    examples: { logtape: { summary: "LogTape payment record", value: logRecordBatchExample } },
  })
  @ApiCreatedResponse({
    description: "The records were accepted, or prior receipts were found for their eventIds.",
    schema: { $ref: "#/components/schemas/LogRecordBatchReceiptV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the log record contract." })
  @ApiUnauthorizedResponse({ description: "The ingestion bearer token is missing or invalid." })
  @ApiForbiddenResponse({ description: "The token does not belong to the project in the path." })
  @ApiPayloadTooLargeResponse({ description: "The JSON request body exceeds 1 MiB." })
  receive(
    @Body(
      new ZodValidationPipe(
        logRecordBatchRequestSchema,
        "Request body does not match the log record contract.",
      ),
    )
    batch: LogRecordBatchRequest,
    @IngestProject() project: IngestedProject,
  ): Promise<LogRecordBatchReceipt> {
    return this.logRecordService.receive(batch, project.id);
  }
}
