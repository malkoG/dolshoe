import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { ErrorReportModule } from "./error-reporting/error-report.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [DatabaseModule, ErrorReportModule, HealthModule],
})
export class AppModule {}
