import type { ProjectDashboardSummary } from "../../lib/dashboard-summary";
import type { OverviewChrome, ProjectOverviewProps } from "./project-overview";

/**
 * Named states for Figma 20 — Project · Overview.
 *
 * @remarks
 * `populated` and `loading` are the two frames on the board. `error` is the
 * other body the overview route can actually show; it changes the silhouette
 * the same way loading does (a DataState instead of tiles). There is no
 * empty frame — zeros still render the dashboard grid, and that difference
 * is a text assertion on the existing widget tests.
 */
const WINDOW_SINCE = "2026-09-04T00:00:00.000Z";
const WINDOW_UNTIL = "2026-09-10T00:00:00.000Z";

const FIGMA_CHROME: OverviewChrome = {
  orgName: "Acme Payments",
  orgInitial: "A",
  projectName: "checkout-api",
  projectInitial: "C",
  viewerName: "Koding Warrior",
  viewerHandle: "@kodingwarrior",
  viewerInitials: "KW",
};

function bucketDates(): string[] {
  return [
    "2026-09-04T00:00:00.000Z",
    "2026-09-05T00:00:00.000Z",
    "2026-09-06T00:00:00.000Z",
    "2026-09-07T00:00:00.000Z",
    "2026-09-08T00:00:00.000Z",
    "2026-09-09T00:00:00.000Z",
    "2026-09-10T00:00:00.000Z",
  ];
}

/**
 * Relative to whenever this factory happens to run, so the three health
 * rows stay in the tones the frame shows (recent, recent, stale) instead
 * of drifting as a fixed 2026 timestamp ages.
 */
function agoIso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

function populatedSummary(): ProjectDashboardSummary {
  const dates = bucketDates();
  return {
    window: { since: WINDOW_SINCE, until: WINDOW_UNTIL },
    errorReports: {
      total: 1284,
      previousPeriodTotal: 1088,
      byEnvironment: { production: 912, staging: 241, development: 131 },
      byRuntime: { "Node 22.3.0": 1002, "Python 3.12": 282 },
      lastReceivedAt: agoIso(3 * 60 * 1000),
    },
    logRecords: { total: 48910, lastReceivedAt: agoIso(1 * 60 * 1000) },
    traces: { total: 3207, lastReceivedAt: agoIso(6 * 60 * 60 * 1000) },
    volumeSeries: dates.map((bucketStart, index) => ({
      bucketStart,
      errorReports: [13, 10, 33, 15, 9, 24, 18][index] ?? 0,
      logRecords: [86, 69, 104, 78, 63, 95, 76][index] ?? 0,
    })),
  };
}

function populated(): ProjectOverviewProps {
  return {
    chrome: FIGMA_CHROME,
    body: { status: "ready", summary: populatedSummary() },
  };
}

function loading(): ProjectOverviewProps {
  return {
    chrome: FIGMA_CHROME,
    body: { status: "loading" },
  };
}

function error(): ProjectOverviewProps {
  return {
    chrome: FIGMA_CHROME,
    body: {
      status: "error",
      description: "Something went wrong while loading the dashboard.",
    },
  };
}

export const projectOverviewStates = {
  populated,
  loading,
  error,
} as const;

export const projectOverviewStateNames = ["populated", "loading", "error"] as const;

export type ProjectOverviewStateName = (typeof projectOverviewStateNames)[number];

export function isProjectOverviewStateName(
  value: string | null,
): value is ProjectOverviewStateName {
  return value != null && (projectOverviewStateNames as readonly string[]).includes(value);
}
