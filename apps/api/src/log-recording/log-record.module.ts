import { Module } from "@nestjs/common";

import { LogRecordController } from "./log-record.controller";
import { LogRecordRepository } from "./log-record.repository";
import { LogRecordService } from "./log-record.service";
import { LogRetentionService } from "./log-retention.service";

@Module({
  controllers: [LogRecordController],
  providers: [LogRecordRepository, LogRecordService, LogRetentionService],
})
export class LogRecordModule {}
