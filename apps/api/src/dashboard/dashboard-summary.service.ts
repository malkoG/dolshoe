import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import {
  DASHBOARD_SUMMARY_WINDOW_DAYS,
  ProjectDashboardSummary,
} from "./dashboard-summary.contract";
import { DashboardSummaryRepository } from "./dashboard-summary.repository";
import {
  buildDailyBuckets,
  buildVolumeSeries,
  foldGroupCounts,
  previousWindow,
  summaryWindow,
  sum,
} from "./dashboard-summary.math";

function toIso(value: Date | null): string | null {
  return value == null ? null : value.toISOString();
}

@Injectable()
export class DashboardSummaryService {
  constructor(
    private readonly database: PrismaService,
    private readonly repository: DashboardSummaryRepository,
  ) {}

  /**
   * Scoped exactly as the error report and trace listings are: a project id
   * from another organization matches nothing here rather than relying on a
   * check further up to have happened.
   */
  async summarize(organizationId: string, projectId: string): Promise<ProjectDashboardSummary> {
    const project = await this.database.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });

    if (project == null) {
      throw new NotFoundException("No such project.");
    }

    const now = new Date();
    const buckets = buildDailyBuckets(now, DASHBOARD_SUMMARY_WINDOW_DAYS);
    const window = summaryWindow(now);
    const previous = previousWindow(now);

    const [
      errorReportBucketCounts,
      logRecordBucketCounts,
      previousPeriodTotal,
      traceTotal,
      byEnvironment,
      byRuntime,
      lastErrorReportReceivedAt,
      lastLogRecordReceivedAt,
      lastRootSpanStartedAt,
    ] = await Promise.all([
      Promise.all(
        buckets.map((bucket) =>
          this.repository.countErrorReportsInRange(projectId, bucket.start, bucket.end),
        ),
      ),
      Promise.all(
        buckets.map((bucket) =>
          this.repository.countLogRecordsInRange(projectId, bucket.start, bucket.end),
        ),
      ),
      this.repository.countErrorReportsInRange(projectId, previous.start, previous.end),
      this.repository.countRootSpansInRange(projectId, window.start, window.end),
      this.repository.errorReportCountsByEnvironment(projectId, window.start, window.end),
      this.repository.errorReportCountsByRuntime(projectId, window.start, window.end),
      this.repository.lastErrorReportReceivedAt(projectId),
      this.repository.lastLogRecordReceivedAt(projectId),
      this.repository.lastRootSpanStartedAt(projectId),
    ]);

    return {
      window: { since: window.start.toISOString(), until: window.end.toISOString() },
      errorReports: {
        total: sum(errorReportBucketCounts),
        previousPeriodTotal,
        byEnvironment: foldGroupCounts(byEnvironment),
        byRuntime: foldGroupCounts(byRuntime),
        lastReceivedAt: toIso(lastErrorReportReceivedAt),
      },
      logRecords: {
        total: sum(logRecordBucketCounts),
        lastReceivedAt: toIso(lastLogRecordReceivedAt),
      },
      traces: {
        total: traceTotal,
        lastReceivedAt: toIso(lastRootSpanStartedAt),
      },
      volumeSeries: buildVolumeSeries(buckets, errorReportBucketCounts, logRecordBucketCounts),
    };
  }
}
