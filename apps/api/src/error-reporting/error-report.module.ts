import { Module } from "@nestjs/common";

import { AlertModule } from "../alerts/alert.module";
import { ErrorReportController } from "./error-report.controller";
import { ErrorReportService } from "./error-report.service";
import { OrganizationErrorReportController } from "./organization-error-report.controller";
import { ProjectErrorReportController } from "./project-error-report.controller";

@Module({
  imports: [AlertModule],
  controllers: [
    ErrorReportController,
    ProjectErrorReportController,
    OrganizationErrorReportController,
  ],
  providers: [ErrorReportService],
})
export class ErrorReportModule {}
