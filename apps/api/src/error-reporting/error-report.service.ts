import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import {
  ERROR_REPORT_LIST_LIMIT,
  ErrorReportListQuery,
  ErrorReportListResponse,
  ErrorReportReceipt,
  ErrorReportRequest,
} from "./error-report.contract";
import { summarizeException } from "./summarize-exception";

function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ErrorReportService {
  constructor(private readonly database: PrismaService) {}

  async receive(report: ErrorReportRequest, projectId: string): Promise<ErrorReportReceipt> {
    const stored = await this.database.errorReport.upsert({
      // An eventId is only an idempotency key within its own project, so a
      // replay keeps the identity it was first stored under.
      where: {
        projectId_eventId: { projectId, eventId: report.eventId },
      },
      update: {},
      create: {
        projectId,
        eventId: report.eventId,
        schemaVersion: report.schemaVersion,
        occurredAt: new Date(report.occurredAt),
        serviceName: report.service.name,
        environment: report.service.environment,
        release: report.service.release,
        runtimeName: report.runtime.name,
        runtimeVersion: report.runtime.version,
        reporterName: report.reporter.name,
        reporterVersion: report.reporter.version,
        mechanismType: report.mechanism?.type,
        handled: report.mechanism?.handled,
        traceId: report.trace?.traceId,
        spanId: report.trace?.spanId,
        exception: asPrismaJson(report.exception),
        attributes: report.attributes ? asPrismaJson(report.attributes) : undefined,
      },
      select: {
        id: true,
        receivedAt: true,
      },
    });

    return {
      id: stored.id,
      receivedAt: stored.receivedAt.toISOString(),
    };
  }

  async list(query: ErrorReportListQuery = {}): Promise<ErrorReportListResponse> {
    const rows = await this.database.errorReport.findMany({
      // Filtered listings are served by [projectId, receivedAt DESC]; the
      // unfiltered one by [receivedAt DESC].
      ...(query.projectId == null ? {} : { where: { projectId: query.projectId } }),
      orderBy: { receivedAt: "desc" },
      take: ERROR_REPORT_LIST_LIMIT,
      select: {
        id: true,
        eventId: true,
        occurredAt: true,
        receivedAt: true,
        serviceName: true,
        environment: true,
        release: true,
        runtimeName: true,
        runtimeVersion: true,
        exception: true,
        project: { select: { id: true, slug: true, name: true } },
      },
    });

    return {
      reports: rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        occurredAt: row.occurredAt.toISOString(),
        receivedAt: row.receivedAt.toISOString(),
        project: row.project,
        service: {
          name: row.serviceName,
          environment: row.environment ?? undefined,
          release: row.release ?? undefined,
        },
        runtime: {
          name: row.runtimeName,
          version: row.runtimeVersion ?? undefined,
        },
        exception: summarizeException(row.exception),
      })),
    };
  }
}
