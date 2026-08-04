import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { LogRecord, LogRecordReceipt } from "./log-record.contract";

interface StoredLogRecordRow {
  eventId: string;
  id: string;
  receivedAt: Date;
}

export interface LogRecordSummaryRow {
  id: string;
  eventId: string;
  occurredAt: Date;
  receivedAt: Date;
  level: string;
  message: string;
  category: string[];
  serviceName: string;
  environment: string | null;
  release: string | null;
  errorReportEventId: string | null;
  attributes: unknown;
}

function postgresTextArray(values: readonly string[]): Prisma.Sql {
  if (values.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`;
}

function recordValues(projectId: string, schemaVersion: number, record: LogRecord): Prisma.Sql {
  const attributes = record.attributes == null ? null : JSON.stringify(record.attributes);

  // This positional VALUES list has no named-column safety net: every change
  // here needs the matching change to the column list in `store`.
  return Prisma.sql`(
    ${projectId}::uuid,
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

  async store(
    projectId: string,
    schemaVersion: number,
    records: readonly LogRecord[],
  ): Promise<LogRecordReceipt[]> {
    const values = records.map((record) => recordValues(projectId, schemaVersion, record));
    const stored = await this.database.$queryRaw<StoredLogRecordRow[]>(Prisma.sql`
      INSERT INTO "LogRecord" (
        "projectId",
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
      ON CONFLICT ("projectId", "eventId") DO UPDATE
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

  async listForProject(
    organizationId: string,
    projectId: string,
    level: string | undefined,
    limit: number,
  ): Promise<LogRecordSummaryRow[]> {
    return this.database.logRecord.findMany({
      where: {
        projectId,
        project: { organizationId },
        ...(level == null ? {} : { level }),
      },
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventId: true,
        occurredAt: true,
        receivedAt: true,
        level: true,
        message: true,
        category: true,
        serviceName: true,
        environment: true,
        release: true,
        errorReportEventId: true,
        attributes: true,
      },
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
