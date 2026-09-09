import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import {
  ERROR_REPORT_LIST_LIMIT,
  ErrorReportDetail,
  ErrorReportListResponse,
  ErrorReportReceipt,
  ErrorReportRequest,
  ErrorReportSummary,
  UserContext,
} from "./error-report.contract";
import { readStoredException } from "./read-stored-exception";
import { summarizeException } from "./summarize-exception";

function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

interface UserColumns {
  userIdentifier: string | null;
  userEmail: string | null;
  userName: string | null;
}

/** `undefined` — not present at all — when the reporter never identified anyone. */
function toUserContext(row: UserColumns): UserContext | undefined {
  if (row.userIdentifier == null && row.userEmail == null && row.userName == null) {
    return undefined;
  }

  return {
    id: row.userIdentifier ?? undefined,
    email: row.userEmail ?? undefined,
    username: row.userName ?? undefined,
  };
}

export interface ErrorReportListFilter {
  tagKey?: string;
  tagValue?: string;
  userId?: string;
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
        userIdentifier: report.user?.id,
        userEmail: report.user?.email,
        userName: report.user?.username,
        tags: report.tags ? asPrismaJson(report.tags) : undefined,
        breadcrumbs: report.breadcrumbs ? asPrismaJson(report.breadcrumbs) : undefined,
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

  /**
   * Both halves of the scope are required. Naming the organization as well as
   * the project means a project id guessed from another tenant matches nothing,
   * rather than relying on a check somewhere further up to have happened.
   *
   * `filter.tagKey`/`filter.tagValue` must arrive together or not at all — the
   * controller's request-schema `.refine()` already enforces that, so this
   * method trusts the pairing rather than re-checking it.
   */
  async list(
    organizationId: string,
    projectId: string,
    filter: ErrorReportListFilter = {},
  ): Promise<ErrorReportListResponse> {
    const rows = await this.database.errorReport.findMany({
      // Served by [projectId, receivedAt DESC]; a tag or user filter narrows
      // that same project-scoped result with a plain scan rather than an
      // index of its own — see the schema's own note on why that is fine for
      // now.
      where: {
        projectId,
        project: { organizationId },
        ...(filter.userId == null ? {} : { userIdentifier: filter.userId }),
        ...(filter.tagKey == null
          ? {}
          : { tags: { path: [filter.tagKey], equals: filter.tagValue } }),
      },
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
        userIdentifier: true,
        userEmail: true,
        userName: true,
        tags: true,
        project: { select: { id: true, slug: true, name: true } },
      },
    });

    return {
      reports: rows.map(
        (row): ErrorReportSummary => ({
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
          user: toUserContext(row),
          tags: (row.tags ?? undefined) as ErrorReportSummary["tags"],
        }),
      ),
    };
  }

  /**
   * One report in full, frames and all.
   *
   * @remarks
   * Scoped exactly as `list` is, and for the same reason: a report id guessed
   * from another tenant matches nothing here rather than relying on a check
   * further up to have happened. A miss and a wrong tenant are the same 404, so
   * the endpoint does not confirm that an id exists somewhere else.
   */
  async get(
    organizationId: string,
    projectId: string,
    reportId: string,
  ): Promise<ErrorReportDetail> {
    const row = await this.database.errorReport.findFirst({
      where: { id: reportId, projectId, project: { organizationId } },
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
        reporterName: true,
        reporterVersion: true,
        mechanismType: true,
        handled: true,
        traceId: true,
        spanId: true,
        exception: true,
        userIdentifier: true,
        userEmail: true,
        userName: true,
        tags: true,
        breadcrumbs: true,
        attributes: true,
        project: { select: { id: true, slug: true, name: true } },
      },
    });

    if (row == null) {
      throw new NotFoundException("No such error report.");
    }

    return {
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
      reporter: {
        name: row.reporterName,
        version: row.reporterVersion ?? undefined,
      },
      mechanism:
        row.mechanismType == null
          ? undefined
          : { type: row.mechanismType, handled: row.handled ?? undefined },
      trace:
        row.traceId == null ? undefined : { traceId: row.traceId, spanId: row.spanId ?? undefined },
      exception: readStoredException(row.exception),
      user: toUserContext(row),
      tags: (row.tags ?? undefined) as ErrorReportDetail["tags"],
      breadcrumbs: (row.breadcrumbs ?? undefined) as ErrorReportDetail["breadcrumbs"],
      attributes: (row.attributes ?? undefined) as ErrorReportDetail["attributes"],
    };
  }
}
