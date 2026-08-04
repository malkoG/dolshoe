import { Injectable } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { flattenOtlpSpans } from "./otlp-spans";
import {
  OtlpExportTraceServiceRequest,
  OtlpExportTraceServiceResponse,
} from "./otlp-trace.contract";
import { SpanRepository } from "./span.repository";

const logger = getLogger(["dolshoe", "tracing", "ingestion"]);

@Injectable()
export class TraceService {
  constructor(private readonly spans: SpanRepository) {}

  /**
   * Store the spans of one OTLP export.
   *
   * @remarks
   * Spans that could not be read are counted into OTLP's partial success rather
   * than failing the request. An exporter retries on a 5xx, so rejecting a batch
   * over a span the server has already judged unreadable would have it resent
   * until it expired.
   */
  async export(
    request: OtlpExportTraceServiceRequest,
    projectId: string,
  ): Promise<OtlpExportTraceServiceResponse> {
    const { spans, rejected, firstRejection } = flattenOtlpSpans(request);

    await this.spans.store(projectId, spans);

    if (rejected === 0) return { partialSuccess: {} };

    logger.warn("Rejected {rejected} of {received} exported spans: {reason}", {
      projectId,
      rejected,
      received: spans.length + rejected,
      reason: firstRejection,
    });

    return {
      partialSuccess: {
        // A proto3 int64 is a string in JSON, even when it is small.
        rejectedSpans: String(rejected),
        ...(firstRejection == null ? {} : { errorMessage: firstRejection }),
      },
    };
  }
}
