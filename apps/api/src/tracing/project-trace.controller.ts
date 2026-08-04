import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from "@nestjs/swagger";

import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { IngestAuthGuard } from "../ingestion/ingest-auth.guard";
import { IngestProject, IngestedProject } from "../ingestion/ingested-project";
import { OtlpJsonContentTypeGuard } from "./otlp-content-type";
import {
  OtlpExportTraceServiceRequest,
  OtlpExportTraceServiceResponse,
  otlpExportTraceServiceRequestSchema,
} from "./otlp-trace.contract";
import { otlpTraceExportExample } from "./otlp-trace.examples";
import { TraceService } from "./trace.service";

/**
 * The project-scoped span ingestion routes a DSN points at.
 *
 * @remarks
 * As with error reports and log records, the path addresses a project and the
 * token authorizes one; `IngestAuthGuard` refuses the request when they
 * disagree.
 *
 * There are two paths because OpenTelemetry exporters are configured two ways.
 * `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is used verbatim and can name either, but
 * the generic `OTEL_EXPORTER_OTLP_ENDPOINT` has `/v1/traces` appended to it by
 * the exporter — so the `otlp` path exists to make
 * `https://<host>/api/v1/projects/<projectId>/otlp` work as a generic endpoint.
 * One handler serves both so they cannot drift apart.
 */
@ApiTags("Tracing")
@ApiBearerAuth("ingest-token")
@ApiParam({ name: "projectId", description: "The project the presented token belongs to." })
@Controller({ path: "projects/:projectId", version: "1" })
export class ProjectTraceController {
  constructor(private readonly traceService: TraceService) {}

  /**
   * Receive an OTLP/HTTP JSON trace export for the project named in the path.
   *
   * @remarks
   * A request carries up to 1000 spans. Re-exporting a span is safe and changes
   * nothing. Spans that cannot be read are counted in the response's partial
   * success rather than failing the export.
   */
  @Post(["traces", "otlp/v1/traces"])
  // OTLP requires 200 with a body, unlike this API's other ingestion routes,
  // which answer 201 with a receipt.
  @HttpCode(HttpStatus.OK)
  @UseGuards(IngestAuthGuard, OtlpJsonContentTypeGuard)
  @ApiBody({
    schema: { $ref: "#/components/schemas/OtlpExportTraceServiceRequest" },
    examples: {
      checkout: {
        summary: "A checkout request as three nested spans",
        value: otlpTraceExportExample,
      },
    },
  })
  @ApiOkResponse({
    description: "The export was accepted, with a count of any spans that could not be read.",
    schema: { $ref: "#/components/schemas/OtlpExportTraceServiceResponse" },
  })
  @ApiBadRequestResponse({ description: "The body is not an OTLP trace export request." })
  @ApiUnauthorizedResponse({ description: "The ingestion bearer token is missing or invalid." })
  @ApiForbiddenResponse({ description: "The token does not belong to the project in the path." })
  @ApiUnsupportedMediaTypeResponse({ description: "The export is not OTLP/HTTP JSON." })
  @ApiPayloadTooLargeResponse({ description: "The JSON request body exceeds 1 MiB." })
  export(
    @Body(
      new ZodValidationPipe(
        otlpExportTraceServiceRequestSchema,
        "Request body does not match the OTLP trace export contract.",
      ),
    )
    request: OtlpExportTraceServiceRequest,
    @IngestProject() project: IngestedProject,
  ): Promise<OtlpExportTraceServiceResponse> {
    return this.traceService.export(request, project.id);
  }
}
