import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
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
 * Ingestion for reporters that carry no project in their URL.
 *
 * @remarks
 * Reading moved to `OrganizationLogRecordController`, under the organization
 * that owns the project. This path stays exactly where it is, and keeps the
 * ingestion token as its only credential, because SDK DSNs derive it.
 */
@ApiTags("Log recording")
@Controller({ path: "log-records", version: "1" })
export class LogRecordController {
  constructor(private readonly logRecordService: LogRecordService) {}

  /**
   * Receive an atomic batch of structured log records.
   *
   * @remarks
   * A batch contains up to 100 records. Repeating eventIds is safe and returns each record's
   * original receipt. Validation failure rejects the entire batch.
   */
  @Post()
  @ApiBearerAuth("ingest-token")
  @ApiUnauthorizedResponse({ description: "The ingestion bearer token is missing or invalid." })
  @UseGuards(IngestAuthGuard)
  @ApiBody({
    schema: { $ref: "#/components/schemas/LogRecordBatchRequestV1" },
    examples: {
      logtape: {
        summary: "LogTape payment record",
        value: logRecordBatchExample,
      },
    },
  })
  @ApiCreatedResponse({
    description: "The records were accepted, or prior receipts were found for their eventIds.",
    schema: { $ref: "#/components/schemas/LogRecordBatchReceiptV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the log record contract." })
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
