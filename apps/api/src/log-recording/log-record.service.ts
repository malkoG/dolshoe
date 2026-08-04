import { Injectable } from "@nestjs/common";

import {
  LOG_RECORD_LIST_LIMIT,
  LogRecordBatchReceipt,
  LogRecordBatchRequest,
  LogRecordListQuery,
  LogRecordListResponse,
  LogRecordSummary,
} from "./log-record.contract";
import { LogRecordRepository, LogRecordSummaryRow } from "./log-record.repository";

function toSummary(row: LogRecordSummaryRow): LogRecordSummary {
  return {
    id: row.id,
    eventId: row.eventId,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    // Persisted rows can predate today's level set; the column is a plain
    // string, so the value is passed through rather than re-validated here.
    level: row.level as LogRecordSummary["level"],
    message: row.message,
    category: row.category,
    service: {
      name: row.serviceName,
      ...(row.environment == null ? {} : { environment: row.environment }),
      ...(row.release == null ? {} : { release: row.release }),
    },
    errorReportEventId: row.errorReportEventId,
    attributes: (row.attributes ?? null) as LogRecordSummary["attributes"],
  };
}

@Injectable()
export class LogRecordService {
  constructor(private readonly logRecords: LogRecordRepository) {}

  async receive(batch: LogRecordBatchRequest, projectId: string): Promise<LogRecordBatchReceipt> {
    return {
      records: await this.logRecords.store(projectId, batch.schemaVersion, batch.records),
    };
  }

  async list(
    organizationId: string,
    projectId: string,
    query: LogRecordListQuery,
  ): Promise<LogRecordListResponse> {
    const rows = await this.logRecords.listForProject(
      organizationId,
      projectId,
      query.level,
      LOG_RECORD_LIST_LIMIT,
    );

    return { records: rows.map(toSummary) };
  }
}
