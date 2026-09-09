import { Injectable, NotFoundException } from "@nestjs/common";

import { AlertEvaluationService } from "../alerts/alert-evaluation.service";
import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { computeFingerprint } from "./compute-fingerprint";
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

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
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
  constructor(
    private readonly database: PrismaService,
    private readonly alertEvaluationService: AlertEvaluationService,
  ) {}

  /**
   * A `create`, not the `upsert` this used to be — telling a genuinely new
   * report apart from an idempotent replay of one already stored is required
   * now, not just informative: only a new report gets evaluated against this
   * project's alert rules. A replay firing "new_fingerprint" or
   * "volume_threshold" again every time a client retries the same event
   * would be a real bug, not a cosmetic one.
   */
  async receive(report: ErrorReportRequest, projectId: string): Promise<ErrorReportReceipt> {
    const fingerprint = computeFingerprint(report.exception);

    try {
      const stored = await this.database.errorReport.create({
        data: {
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
          fingerprint,
        },
        select: {
          id: true,
          receivedAt: true,
        },
      });

      const exceptionSummary = summarizeException(report.exception);
      await this.alertEvaluationService.evaluateForReport(projectId, {
        id: stored.id,
        fingerprint,
        environment: report.service.environment ?? null,
        serviceName: report.service.name,
        tags: report.tags,
        occurredAt: new Date(report.occurredAt),
        exceptionType: exceptionSummary.type,
        exceptionMessage: exceptionSummary.message,
      });

      return {
        id: stored.id,
        receivedAt: stored.receivedAt.toISOString(),
      };
    } catch (error) {
      if (isPrismaError(error, UNIQUE_CONSTRAINT_VIOLATION)) {
        // An eventId is only an idempotency key within its own project, so a
        // replay returns the receipt it was first stored under rather than
        // evaluating alert rules a second time.
        const existing = await this.database.errorReport.findUniqueOrThrow({
          where: { projectId_eventId: { projectId, eventId: report.eventId } },
          select: { id: true, receivedAt: true },
        });
        return { id: existing.id, receivedAt: existing.receivedAt.toISOString() };
      }
      throw error;
    }
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
