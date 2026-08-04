import { Injectable } from "@nestjs/common";

import { LogRecordBatchReceipt, LogRecordBatchRequest } from "./log-record.contract";
import { LogRecordRepository } from "./log-record.repository";

@Injectable()
export class LogRecordService {
  constructor(private readonly logRecords: LogRecordRepository) {}

  async receive(batch: LogRecordBatchRequest, projectId: string): Promise<LogRecordBatchReceipt> {
    return {
      records: await this.logRecords.store(projectId, batch.schemaVersion, batch.records),
    };
  }
}
