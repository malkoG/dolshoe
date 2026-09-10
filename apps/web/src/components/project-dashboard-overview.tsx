import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { StatusDot } from "@dolshoe/ui/components/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@dolshoe/ui/components/ui/tooltip";
import { cn } from "@dolshoe/ui/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { ProjectDashboardSummary } from "../lib/dashboard-summary";
import { dateFormatter, formatRelativeTime, pluralize } from "../lib/format";

/**
 * A project's landing screen.
 *
 * @remarks
 * This is layout, not the finished widgets: most slots below still render the
 * summary's own numbers as plainly as possible — a list, not a chart. The
 * point of this pass is the grid and the props contract it is built on
 * (`ProjectDashboardSummary`, already frozen in `lib/dashboard-summary.ts`).
 * The daily-volume slot is the exception: it is the one place a bare number
 * list actively hides the thing worth seeing (a trend across seven days), so
 * it gets a real chart now. Turning the remaining slots into something worth
 * looking at is later, separate work, one slot at a time.
 */
export interface ProjectDashboardOverviewProps {
  summary: ProjectDashboardSummary;
}

/** Figma's window line ("Sep 4, 2026") — `dateStyle: "medium"` varies by ICU. */
const windowDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatWindowRange(summary: ProjectDashboardSummary): string {
  const since = windowDateFormatter.format(new Date(summary.window.since));
  const until = windowDateFormatter.format(new Date(summary.window.until));
  return `${since} – ${until}`;
}

type TrendTone = "success" | "danger" | "neutral";
type TrendDirection = "up" | "down" | "flat";

interface StatTrend {
  text: string;
  tone: TrendTone;
  direction: TrendDirection;
}

const TREND_TONE_CLASSES: Record<TrendTone, string> = {
  success: "text-success",
  danger: "text-brand",
  neutral: "text-muted-foreground",
};

function TrendIndicator({ trend }: Readonly<{ trend: StatTrend }>) {
  const Icon =
    trend.direction === "up" ? ChevronUp : trend.direction === "down" ? ChevronDown : null;

  return (
    <p className={cn("flex items-center gap-1 text-meta", TREND_TONE_CLASSES[trend.tone])}>
      {Icon != null && <Icon aria-hidden="true" className="size-3" />}
      {trend.text}
    </p>
  );
}

function StatCard({
  label,
  total,
  trend,
}: Readonly<{ label: string; total: number; trend?: StatTrend }>) {
  return (
    <Panel>
      <PanelBar className="h-[52px] min-h-[52px] py-0 pr-3 pl-4">
        <PanelSummary className="text-meta-strong font-semibold">{label}</PanelSummary>
      </PanelBar>
      <div className="flex flex-col gap-1 p-6">
        <p className="text-display tracking-[-0.5px]">{total.toLocaleString()}</p>
        {trend != null && <TrendIndicator trend={trend} />}
      </div>
    </Panel>
  );
}

function describeTrend(total: number, previousPeriodTotal: number): string {
  if (previousPeriodTotal === 0) {
    return total === 0 ? "No change from the prior period" : "Up from zero last period";
  }

  const change = Math.round(((total - previousPeriodTotal) / previousPeriodTotal) * 100);
  if (change === 0) return "No change from the prior period";
  return `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% from the prior period`;
}

function trendDirection(total: number, previousPeriodTotal: number): TrendDirection {
  if (previousPeriodTotal === 0) return total === 0 ? "flat" : "up";
  if (total === previousPeriodTotal) return "flat";
  return total > previousPeriodTotal ? "up" : "down";
}

/**
 * For error reports, more is worse: an increase is colored as a bad signal
 * and a decrease as a good one — the opposite of a naive "up is green". Log
 * and trace totals carry no trend today; the contract has no
 * `previousPeriodTotal` for them.
 */
function errorReportTrend(total: number, previousPeriodTotal: number): StatTrend {
  const direction = trendDirection(total, previousPeriodTotal);
  return {
    text: describeTrend(total, previousPeriodTotal),
    tone: direction === "up" ? "danger" : direction === "down" ? "success" : "neutral",
    direction,
  };
}

function BreakdownList({
  counts,
  emptyLabel,
}: Readonly<{ counts: Record<string, number>; emptyLabel: string }>) {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return <p className="px-4 py-4 text-body text-muted-foreground">{emptyLabel}</p>;
  }

  // A magnitude encoding, not an identity one — one hue, scaled by each row's
  // share of the largest count in its own list, rather than a color per row.
  const max = Math.max(...entries.map(([, count]) => count), 1);

  return (
    <ul className="divide-y divide-border">
      {entries.map(([key, count]) => (
        <li className="relative flex h-9 items-center px-4 text-body" key={key}>
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-muted"
            style={{ width: `${(count / max) * 100}%` }}
          />
          <div className="relative flex w-full items-center justify-between">
            <span>{key}</span>
            <span className="font-mono text-mono text-muted-foreground">{count}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

const shortDateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

const CHART_WIDTH = 700;
const CHART_BAR_AREA_HEIGHT = 108;
const CHART_LABEL_ROW_HEIGHT = 22;
const CHART_HEIGHT = CHART_BAR_AREA_HEIGHT + CHART_LABEL_ROW_HEIGHT;
const BAR_WIDTH = 16;
const BAR_GAP = 6;
const BAR_RADIUS = 4;

/**
 * A bar path rounded only where it meets open space, flat where it meets the
 * baseline — an SVG `rect` cannot express that with `rx` alone, which rounds
 * every corner including the two sitting on the axis.
 */
function roundedTopBarPath(x: number, top: number, width: number, bottom: number): string {
  const radius = Math.min(BAR_RADIUS, bottom - top);
  if (radius <= 0) return "";

  return `
    M ${x},${bottom}
    L ${x},${top + radius}
    Q ${x},${top} ${x + radius},${top}
    L ${x + width - radius},${top}
    Q ${x + width},${top} ${x + width},${top + radius}
    L ${x + width},${bottom}
    Z
  `;
}

function VolumeSeriesPanel({ summary }: Readonly<{ summary: ProjectDashboardSummary }>) {
  const buckets = summary.volumeSeries;
  const maxValue = Math.max(1, ...buckets.flatMap((b) => [b.errorReports, b.logRecords]));
  const groupWidth = buckets.length === 0 ? 0 : CHART_WIDTH / buckets.length;
  const pairWidth = BAR_WIDTH * 2 + BAR_GAP;
  const baseline = CHART_BAR_AREA_HEIGHT;

  const totalErrors = buckets.reduce((total, bucket) => total + bucket.errorReports, 0);
  const totalLogs = buckets.reduce((total, bucket) => total + bucket.logRecords, 0);
  const summaryLabel = `Daily error report and log record volume, ${dateFormatter.format(
    new Date(summary.window.since),
  )} to ${dateFormatter.format(new Date(summary.window.until))}: ${pluralize(
    totalErrors,
    "error report",
  )} and ${pluralize(totalLogs, "log record")} in total.`;

  return (
    <Panel>
      <PanelBar className="h-[52px] min-h-[52px] py-0 pr-3 pl-4">
        <PanelSummary className="text-meta-strong font-semibold">Daily volume</PanelSummary>
      </PanelBar>

      {buckets.length === 0 ? (
        <p className="px-5 py-4 text-body text-muted-foreground">No data for this window yet.</p>
      ) : (
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-4 font-mono text-badge tracking-[0.06em] text-muted-foreground uppercase">
            <span className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-full bg-chart-error"
              />
              Error reports
            </span>
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="inline-block size-2 rounded-full bg-chart-logs" />
              Log records
            </span>
          </div>

          <TooltipProvider>
            <svg
              aria-label={summaryLabel}
              className="h-auto w-full"
              role="img"
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            >
              <line
                aria-hidden="true"
                className="stroke-chart-grid"
                strokeWidth={1}
                x1={0}
                x2={CHART_WIDTH}
                y1={baseline}
                y2={baseline}
              />

              {buckets.map((bucket, index) => {
                const groupX = index * groupWidth;
                const pairX = groupX + (groupWidth - pairWidth) / 2;
                const errorHeight = (bucket.errorReports / maxValue) * CHART_BAR_AREA_HEIGHT;
                const logHeight = (bucket.logRecords / maxValue) * CHART_BAR_AREA_HEIGHT;

                return (
                  <Tooltip key={bucket.bucketStart}>
                    <TooltipTrigger asChild>
                      <g className="cursor-default" tabIndex={0}>
                        <rect
                          aria-hidden="true"
                          fill="transparent"
                          height={baseline}
                          width={groupWidth}
                          x={groupX}
                          y={0}
                        />
                        {bucket.errorReports > 0 && (
                          <path
                            aria-hidden="true"
                            className="fill-chart-error"
                            d={roundedTopBarPath(
                              pairX,
                              baseline - errorHeight,
                              BAR_WIDTH,
                              baseline,
                            )}
                          />
                        )}
                        {bucket.logRecords > 0 && (
                          <path
                            aria-hidden="true"
                            className="fill-chart-logs"
                            d={roundedTopBarPath(
                              pairX + BAR_WIDTH + BAR_GAP,
                              baseline - logHeight,
                              BAR_WIDTH,
                              baseline,
                            )}
                          />
                        )}
                        <text
                          aria-hidden="true"
                          className="fill-faint font-mono text-[9px]"
                          textAnchor="middle"
                          x={groupX + groupWidth / 2}
                          y={baseline + CHART_LABEL_ROW_HEIGHT - 6}
                        >
                          {shortDateFormatter.format(new Date(bucket.bucketStart))}
                        </text>
                      </g>
                    </TooltipTrigger>
                    <TooltipContent>
                      {dateFormatter.format(new Date(bucket.bucketStart))}:{" "}
                      {pluralize(bucket.errorReports, "error")} ·{" "}
                      {pluralize(bucket.logRecords, "log")}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </svg>
          </TooltipProvider>
        </div>
      )}
    </Panel>
  );
}

function BreakdownPanel({ summary }: Readonly<{ summary: ProjectDashboardSummary }>) {
  return (
    <Panel>
      <PanelBar className="h-[52px] min-h-[52px] py-0 pr-3 pl-4">
        <PanelSummary className="text-meta-strong font-semibold">
          Error reports by environment and runtime
        </PanelSummary>
      </PanelBar>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div>
          <p className="px-4 pt-3 pb-1 font-mono text-badge tracking-[0.06em] text-faint uppercase">
            Environment
          </p>
          <BreakdownList counts={summary.errorReports.byEnvironment} emptyLabel="No reports yet." />
        </div>
        <div>
          <p className="px-4 pt-3 pb-1 font-mono text-badge tracking-[0.06em] text-faint uppercase">
            Runtime
          </p>
          <BreakdownList counts={summary.errorReports.byRuntime} emptyLabel="No reports yet." />
        </div>
      </div>
    </Panel>
  );
}

const HEALTH_RECENT_MS = 60 * 60 * 1000;
const HEALTH_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * How fresh a signal's last-received timestamp is, as a status tone: recent
 * enough to look healthy, old enough to look stale, or old enough (or absent
 * entirely) that freshness has nothing left to say. A negative age — a
 * timestamp at or after `now` — falls into "recent" the same way a real one
 * would; there's no clock-skew case worth a branch of its own.
 */
export function healthTone(
  lastReceivedAt: string | null,
  now: Date = new Date(),
): "success" | "warning" | "neutral" {
  if (lastReceivedAt == null) return "neutral";

  const age = now.getTime() - new Date(lastReceivedAt).getTime();
  if (age <= HEALTH_RECENT_MS) return "success";
  if (age <= HEALTH_STALE_MS) return "warning";
  return "neutral";
}

function HealthRow({
  label,
  lastReceivedAt,
}: Readonly<{ label: string; lastReceivedAt: string | null }>) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 py-2 text-body">
      <span className="flex items-center gap-2">
        <StatusDot tone={healthTone(lastReceivedAt)} />
        {label}
      </span>
      {lastReceivedAt == null ? (
        <span className="font-mono text-mono text-faint">Never</span>
      ) : (
        <time className="font-mono text-mono text-muted-foreground" dateTime={lastReceivedAt}>
          {formatRelativeTime(lastReceivedAt)}
        </time>
      )}
    </div>
  );
}

function HealthPanel({ summary }: Readonly<{ summary: ProjectDashboardSummary }>) {
  return (
    <Panel className="w-full max-w-[548px]">
      <PanelBar className="h-[52px] min-h-[52px] py-0 pr-3 pl-4">
        <PanelSummary className="text-meta-strong font-semibold">Last event received</PanelSummary>
      </PanelBar>
      <div className="divide-y divide-border">
        <HealthRow label="Error report" lastReceivedAt={summary.errorReports.lastReceivedAt} />
        <HealthRow label="Log record" lastReceivedAt={summary.logRecords.lastReceivedAt} />
        <HealthRow label="Trace" lastReceivedAt={summary.traces.lastReceivedAt} />
      </div>
    </Panel>
  );
}

export function ProjectDashboardOverview({ summary }: ProjectDashboardOverviewProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-mono text-muted-foreground">{formatWindowRange(summary)}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Error reports"
          total={summary.errorReports.total}
          trend={errorReportTrend(
            summary.errorReports.total,
            summary.errorReports.previousPeriodTotal,
          )}
        />
        <StatCard label="Log records" total={summary.logRecords.total} />
        <StatCard label="Traces" total={summary.traces.total} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VolumeSeriesPanel summary={summary} />
        <BreakdownPanel summary={summary} />
      </div>

      <HealthPanel summary={summary} />
    </div>
  );
}
