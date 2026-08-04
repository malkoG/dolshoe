import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { ErrorReportModule } from "./error-reporting/error-report.module";
import { HealthModule } from "./health/health.module";
import { IngestionModule } from "./ingestion/ingestion.module";
import { LogRecordModule } from "./log-recording/log-record.module";
import { MessageQueueModule } from "./message-queue/message-queue.module";
import { ProjectModule } from "./projects/project.module";

@Module({
  imports: [
    DatabaseModule,
    ProjectModule,
    IngestionModule,
    ErrorReportModule,
    LogRecordModule,
    HealthModule,
    MessageQueueModule,
  ],
})
export class AppModule {}
