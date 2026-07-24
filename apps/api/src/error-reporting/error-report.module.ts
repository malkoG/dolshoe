import { Module } from "@nestjs/common";

import { ErrorReportController } from "./error-report.controller";
import { ErrorReportService } from "./error-report.service";

@Module({
  controllers: [ErrorReportController],
  providers: [ErrorReportService],
})
export class ErrorReportModule {}
