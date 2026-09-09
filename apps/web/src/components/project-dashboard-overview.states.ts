import type { ProjectDashboardSummary } from "../lib/dashboard-summary";
import type { ProjectDashboardOverviewProps } from "./project-dashboard-overview";

/**
 * Named states for the project dashboard overview.
 *
 * @remarks
 * The view is a public view: it receives a summary and paints it. These
 * factories are the other composition root — the one a construction test and
 * a silhouette use instead of fetching from the API.
 *
 * There is no loading or error state here. The route that wraps this view
 * carries those; the view itself only ever sees a resolved summary.
 */
const WINDOW_SINCE = "2026-09-02T00:00:00.000Z";
const WINDOW_UNTIL = "2026-09-09T00:00:00.000Z";

function bucketDates(): string[] {
  return [
    "2026-09-02T00:00:00.000Z",
    "2026-09-03T00:00:00.000Z",
    "2026-09-04T00:00:00.000Z",
    "2026-09-05T00:00:00.000Z",
    "2026-09-06T00:00:00.000Z",
    "2026-09-07T00:00:00.000Z",
    "2026-09-08T00:00:00.000Z",
  ];
}

function empty(): ProjectDashboardOverviewProps {
  const summary: ProjectDashboardSummary = {
    window: { since: WINDOW_SINCE, until: WINDOW_UNTIL },
    errorReports: {
      total: 0,
      previousPeriodTotal: 0,
      byEnvironment: {},
      byRuntime: {},
      lastReceivedAt: null,
    },
    logRecords: { total: 0, lastReceivedAt: null },
    traces: { total: 0, lastReceivedAt: null },
    volumeSeries: bucketDates().map((bucketStart) => ({
      bucketStart,
      errorReports: 0,
      logRecords: 0,
    })),
  };

  return { summary };
}

/**
 * Relative to whenever this factory happens to run, rather than another fixed
 * 2026 timestamp like the rest of this file's fixture data: the three health
 * rows are meant to land in three different freshness tones (recent, stale,
 * quiet), and a fixed timestamp drifts across those bands as real time moves
 * on — worse, a future-dated one never reads as "received" at all.
 */
function agoIso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

function populated(): ProjectDashboardOverviewProps {
  const dates = bucketDates();
  const summary: ProjectDashboardSummary = {
    window: { since: WINDOW_SINCE, until: WINDOW_UNTIL },
    errorReports: {
      total: 84,
      previousPeriodTotal: 61,
      byEnvironment: { production: 57, staging: 21, unspecified: 6 },
      byRuntime: { node: 48, cpython: 22, deno: 9, bun: 5 },
      lastReceivedAt: agoIso(20 * 60 * 1000), // 20 minutes ago — recent
    },
    logRecords: { total: 512, lastReceivedAt: agoIso(5 * 60 * 60 * 1000) }, // 5 hours ago — stale
    traces: { total: 133, lastReceivedAt: agoIso(3 * 24 * 60 * 60 * 1000) }, // 3 days ago — quiet
    volumeSeries: dates.map((bucketStart, index) => ({
      bucketStart,
      errorReports: [8, 6, 14, 10, 19, 11, 16][index] ?? 0,
      logRecords: [61, 55, 88, 70, 102, 68, 68][index] ?? 0,
    })),
  };

  return { summary };
}

export const projectDashboardOverviewStates = {
  empty,
  populated,
} as const;

export const projectDashboardOverviewStateNames = ["empty", "populated"] as const;

export type ProjectDashboardOverviewStateName = (typeof projectDashboardOverviewStateNames)[number];

export function isProjectDashboardOverviewStateName(
  value: string | null,
): value is ProjectDashboardOverviewStateName {
  return value != null && (projectDashboardOverviewStateNames as readonly string[]).includes(value);
}
