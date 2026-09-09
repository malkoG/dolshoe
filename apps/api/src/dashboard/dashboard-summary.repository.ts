import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";

export interface GroupCountRow {
  key: string | null;
  count: number;
}

interface RawGroupCountRow {
  key: string | null;
  count: bigint;
}

@Injectable()
export class DashboardSummaryRepository {
  constructor(private readonly database: PrismaService) {}

  /**
   * Error reports and log records are windowed by `receivedAt`, matching the
   * index both models actually carry `(projectId, receivedAt DESC)`. Root
   * spans are windowed by `startedAt`, the timestamp `Span`'s own index leads
   * with instead.
   */
  countErrorReportsInRange(projectId: string, start: Date, end: Date): Promise<number> {
    return this.database.errorReport.count({
      where: { projectId, receivedAt: { gte: start, lt: end } },
    });
  }

  countLogRecordsInRange(projectId: string, start: Date, end: Date): Promise<number> {
    return this.database.logRecord.count({
      where: { projectId, receivedAt: { gte: start, lt: end } },
    });
  }

  countRootSpansInRange(projectId: string, start: Date, end: Date): Promise<number> {
    return this.database.span.count({
      where: { projectId, parentSpanId: null, startedAt: { gte: start, lt: end } },
    });
  }

  async lastErrorReportOccurredAt(projectId: string): Promise<Date | null> {
    const row = await this.database.errorReport.findFirst({
      where: { projectId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    return row?.occurredAt ?? null;
  }

  async lastLogRecordOccurredAt(projectId: string): Promise<Date | null> {
    const row = await this.database.logRecord.findFirst({
      where: { projectId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    return row?.occurredAt ?? null;
  }

  async lastRootSpanStartedAt(projectId: string): Promise<Date | null> {
    const row = await this.database.span.findFirst({
      where: { projectId, parentSpanId: null },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    return row?.startedAt ?? null;
  }

  /**
   * Raw rather than Prisma's `groupBy`, which shapes a count as `_count._all`
   * — a field name `no-underscore-dangle` refuses to let call sites read.
   */
  async errorReportCountsByEnvironment(
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<GroupCountRow[]> {
    const rows = await this.database.$queryRaw<RawGroupCountRow[]>(Prisma.sql`
      SELECT "environment" AS "key", count(*) AS "count"
      FROM "ErrorReport"
      WHERE "projectId" = ${projectId}::uuid
        AND "receivedAt" >= ${start}
        AND "receivedAt" < ${end}
      GROUP BY "environment"
    `);
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async errorReportCountsByRuntime(
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<GroupCountRow[]> {
    const rows = await this.database.$queryRaw<RawGroupCountRow[]>(Prisma.sql`
      SELECT "runtimeName" AS "key", count(*) AS "count"
      FROM "ErrorReport"
      WHERE "projectId" = ${projectId}::uuid
        AND "receivedAt" >= ${start}
        AND "receivedAt" < ${end}
      GROUP BY "runtimeName"
    `);
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }
}
