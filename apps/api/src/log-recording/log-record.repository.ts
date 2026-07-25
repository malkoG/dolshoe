import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { LogRecord, LogRecordReceipt } from "./log-record.contract";

interface StoredLogRecordRow {
  eventId: string;
  id: string;
  receivedAt: Date;
}

function postgresTextArray(values: readonly string[]): Prisma.Sql {
  if (values.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`;
}

function recordValues(schemaVersion: number, record: LogRecord): Prisma.Sql {
  const attributes = record.attributes == null ? null : JSON.stringify(record.attributes);

  return Prisma.sql`(
    ${record.eventId}::uuid,
    ${schemaVersion},
    ${new Date(record.occurredAt)},
    ${record.level},
    ${record.message},
    ${postgresTextArray(record.category)},
    ${record.service.name},
    ${record.service.environment ?? null},
    ${record.service.release ?? null},
    ${record.runtime.name},
    ${record.runtime.version ?? null},
    ${record.reporter.name},
    ${record.reporter.version ?? null},
    ${record.trace?.traceId ?? null},
    ${record.trace?.spanId ?? null},
    ${record.errorReportEventId ?? null}::uuid,
    ${attributes}::jsonb
  )`;
}

@Injectable()
export class LogRecordRepository {
  constructor(private readonly database: PrismaService) {}

  async store(schemaVersion: number, records: readonly LogRecord[]): Promise<LogRecordReceipt[]> {
    const values = records.map((record) => recordValues(schemaVersion, record));
    const stored = await this.database.$queryRaw<StoredLogRecordRow[]>(Prisma.sql`
      INSERT INTO "LogRecord" (
        "eventId",
        "schemaVersion",
        "occurredAt",
        "level",
        "message",
        "category",
        "serviceName",
        "environment",
        "release",
        "runtimeName",
        "runtimeVersion",
        "reporterName",
        "reporterVersion",
        "traceId",
        "spanId",
        "errorReportEventId",
        "attributes"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("eventId") DO UPDATE
        SET "eventId" = EXCLUDED."eventId"
      RETURNING "eventId", "id", "receivedAt"
    `);

    const byEventId = new Map(stored.map((row) => [row.eventId, row]));
    return records.map((record) => {
      const row = byEventId.get(record.eventId);
      if (row == null) {
        throw new Error(`PostgreSQL did not return a receipt for log event ${record.eventId}.`);
      }
      return {
        eventId: row.eventId,
        id: row.id,
        receivedAt: row.receivedAt.toISOString(),
      };
    });
  }

  async deleteReceivedBefore(cutoff: Date): Promise<number> {
    const result = await this.database.logRecord.deleteMany({
      where: {
        receivedAt: {
          lt: cutoff,
        },
      },
    });
    return result.count;
  }
}
