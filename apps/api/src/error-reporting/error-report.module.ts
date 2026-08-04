import { Module } from "@nestjs/common";

import { ErrorReportController } from "./error-report.controller";
import { ErrorReportService } from "./error-report.service";
import { ProjectErrorReportController } from "./project-error-report.controller";

@Module({
  controllers: [ErrorReportController, ProjectErrorReportController],
  providers: [ErrorReportService],
})
export class ErrorReportModule {}
