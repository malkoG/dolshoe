import { DASHBOARD_SUMMARY_WINDOW_DAYS, DashboardVolumeBucket } from "./dashboard-summary.contract";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

/**
 * `days` consecutive 24-hour ranges ending at `now`, oldest first.
 *
 * @remarks
 * Rolling 24-hour slices rather than calendar-day boundaries: a fixed trailing
 * window has no timezone to align to, and the alternative would make the last
 * bucket a partial day for all but one instant per day.
 */
export function buildDailyBuckets(now: Date, days: number): DateRange[] {
  const buckets: DateRange[] = [];
  for (let index = 0; index < days; index++) {
    const start = new Date(now.getTime() - (days - index) * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);
    buckets.push({ start, end });
  }
  return buckets;
}

/** The window a `buildDailyBuckets(now, days)` result covers, as one range. */
export function summaryWindow(now: Date, days: number = DASHBOARD_SUMMARY_WINDOW_DAYS): DateRange {
  return { start: new Date(now.getTime() - days * DAY_MS), end: now };
}

/** The equal-length window immediately before `summaryWindow`. */
export function previousWindow(now: Date, days: number = DASHBOARD_SUMMARY_WINDOW_DAYS): DateRange {
  const current = summaryWindow(now, days);
  return { start: new Date(current.start.getTime() - days * DAY_MS), end: current.start };
}

/**
 * Folds grouped-count rows into the contract's flat map.
 *
 * @remarks
 * A `null` or empty group key — an event with no `environment` or an
 * unrecognized `runtimeName` some future reporter left blank — reads as
 * "unspecified" rather than being silently dropped, the same convention the
 * web reports list already applies to a missing environment.
 */
export function foldGroupCounts(
  rows: readonly { key: string | null; count: number }[],
): Record<string, number> {
  const folded: Record<string, number> = {};

  for (const row of rows) {
    const key = row.key == null || row.key.length === 0 ? "unspecified" : row.key;
    folded[key] = (folded[key] ?? 0) + row.count;
  }

  return folded;
}

/** Zips per-bucket counts, one array per signal, into the contract's series. */
export function buildVolumeSeries(
  buckets: readonly DateRange[],
  errorReportCounts: readonly number[],
  logRecordCounts: readonly number[],
): DashboardVolumeBucket[] {
  return buckets.map((bucket, index) => ({
    bucketStart: bucket.start.toISOString(),
    errorReports: errorReportCounts[index] ?? 0,
    logRecords: logRecordCounts[index] ?? 0,
  }));
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
