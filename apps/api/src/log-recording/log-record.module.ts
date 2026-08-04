import { Module } from "@nestjs/common";

import { LogRecordController } from "./log-record.controller";
import { OrganizationLogRecordController } from "./organization-log-record.controller";
import { LogRecordRepository } from "./log-record.repository";
import { LogRecordService } from "./log-record.service";
import { LogRetentionService } from "./log-retention.service";
import { ProjectLogRecordController } from "./project-log-record.controller";

@Module({
  controllers: [LogRecordController, ProjectLogRecordController, OrganizationLogRecordController],
  providers: [LogRecordRepository, LogRecordService, LogRetentionService],
})
export class LogRecordModule {}
