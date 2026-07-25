import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { ErrorReportModule } from "./error-reporting/error-report.module";
import { HealthModule } from "./health/health.module";
import { MessageQueueModule } from "./message-queue/message-queue.module";

@Module({
  imports: [DatabaseModule, ErrorReportModule, HealthModule, MessageQueueModule],
})
export class AppModule {}
