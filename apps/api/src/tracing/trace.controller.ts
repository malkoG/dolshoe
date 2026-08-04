import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
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
 * Span ingestion for exporters that carry no project in their URL.
 *
 * @remarks
 * An OpenTelemetry exporter appends `/v1/traces` to a generic endpoint, so
 * pointing `OTEL_EXPORTER_OTLP_ENDPOINT` at `https://<host>/api` reaches this
 * route. It is the ingestion-token equivalent of `/api/v1/log-records`.
 */
@ApiTags("Tracing")
@Controller({ path: "traces", version: "1" })
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  /**
   * Receive an OTLP/HTTP JSON trace export.
   *
   * @remarks
   * A request carries up to 1000 spans. Re-exporting a span is safe and changes
   * nothing. Spans that cannot be read are counted in the response's partial
   * success rather than failing the export.
   */
  @Post()
  // OTLP requires 200 with a body, unlike this API's other ingestion routes,
  // which answer 201 with a receipt.
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("ingest-token")
  @ApiUnauthorizedResponse({ description: "The ingestion bearer token is missing or invalid." })
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
