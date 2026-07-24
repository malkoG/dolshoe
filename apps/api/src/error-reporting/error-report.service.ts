import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { ErrorReportReceipt, ErrorReportRequest } from "./error-report.contract";

function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ErrorReportService {
  constructor(private readonly database: PrismaService) {}

  async receive(report: ErrorReportRequest): Promise<ErrorReportReceipt> {
    const stored = await this.database.errorReport.upsert({
      where: {
        eventId: report.eventId,
      },
      update: {},
      create: {
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
}
