import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { IngestAuthGuard } from "../ingestion/ingest-auth.guard";
import { IngestProject, IngestedProject } from "../ingestion/ingested-project";
import {
  LogRecordBatchReceipt,
  LogRecordBatchRequest,
  LogRecordListQuery,
  LogRecordListResponse,
  logRecordBatchRequestSchema,
  logRecordListQuerySchema,
} from "./log-record.contract";
import { logRecordBatchExample } from "./log-record.examples";
import { LogRecordService } from "./log-record.service";

@ApiTags("Log recording")
@Controller({ path: "log-records", version: "1" })
export class LogRecordController {
  constructor(private readonly logRecordService: LogRecordService) {}

  /**
   * List a project's most recently received log records.
   *
   * @remarks
   * Always scoped to one project. Unauthenticated, like the error report
   * listing: no viewer-auth system exists yet, so this read endpoint is not
   * gated by the ingestion guard.
   */
  @Get()
  @ApiQuery({ name: "projectId", required: true, description: "Project to read logs for." })
  @ApiQuery({ name: "level", required: false, description: "Limit the listing to one severity." })
  @ApiOkResponse({
    description: "Newest-first log records, bounded to the documented limit.",
    schema: { $ref: "#/components/schemas/LogRecordListResponseV1" },
  })
  @ApiBadRequestResponse({ description: "The query does not satisfy the log listing contract." })
  list(
    @Query(new ZodValidationPipe(logRecordListQuerySchema, "Invalid log record list query."))
    query: LogRecordListQuery,
  ): Promise<LogRecordListResponse> {
    return this.logRecordService.list(query);
  }

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
