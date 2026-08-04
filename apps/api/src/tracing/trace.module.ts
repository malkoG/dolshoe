import { Module } from "@nestjs/common";

import { OtlpJsonContentTypeGuard } from "./otlp-content-type";
import { ProjectTraceController } from "./project-trace.controller";
import { SpanRepository } from "./span.repository";
import { SpanRetentionService } from "./span-retention.service";
import { TraceController } from "./trace.controller";
import { TraceService } from "./trace.service";

@Module({
  controllers: [TraceController, ProjectTraceController],
  providers: [OtlpJsonContentTypeGuard, SpanRepository, SpanRetentionService, TraceService],
})
export class TraceModule {}
