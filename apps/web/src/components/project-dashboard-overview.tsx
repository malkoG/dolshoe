import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@dolshoe/ui/components/ui/tooltip";

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

function formatWindowRange(summary: ProjectDashboardSummary): string {
  const since = dateFormatter.format(new Date(summary.window.since));
  const until = dateFormatter.format(new Date(summary.window.until));
  return `${since} – ${until}`;
}

function StatCard({
  label,
  total,
  trend,
}: Readonly<{ label: string; total: number; trend?: string }>) {
  return (
    <Panel>
      <PanelBar>
        <PanelSummary>{label}</PanelSummary>
      </PanelBar>
      <div className="px-5 py-6">
        <p className="text-2xl font-bold">{total.toLocaleString()}</p>
        {trend != null && <p className="mt-1 text-[11px] text-muted-foreground">{trend}</p>}
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

function BreakdownList({
  counts,
  emptyLabel,
}: Readonly<{ counts: Record<string, number>; emptyLabel: string }>) {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return <p className="px-5 py-4 text-[13px] text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {entries.map(([key, count]) => (
        <li className="flex items-center justify-between px-5 py-2.5 text-[13px]" key={key}>
          <span>{key}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
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
      <PanelBar>
        <PanelSummary>Daily volume</PanelSummary>
      </PanelBar>

      {buckets.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted-foreground">No data for this window yet.</p>
      ) : (
        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block size-2 rounded-full bg-brand" />
              Error reports
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block size-2 rounded-full bg-info" />
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
                className="stroke-border"
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
                            className="fill-brand"
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
                            className="fill-info"
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
      <PanelBar>
        <PanelSummary>Error reports by environment and runtime</PanelSummary>
      </PanelBar>
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div>
          <p className="px-5 pt-4 font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
            Environment
          </p>
          <BreakdownList counts={summary.errorReports.byEnvironment} emptyLabel="No reports yet." />
        </div>
        <div>
          <p className="px-5 pt-4 font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
            Runtime
          </p>
          <BreakdownList counts={summary.errorReports.byRuntime} emptyLabel="No reports yet." />
        </div>
      </div>
    </Panel>
  );
}

function HealthRow({
  label,
  lastReceivedAt,
}: Readonly<{ label: string; lastReceivedAt: string | null }>) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 text-[13px]">
      <span>{label}</span>
      {lastReceivedAt == null ? (
        <span className="font-mono text-[11px] text-faint">Never</span>
      ) : (
        <time className="font-mono text-[11px] text-muted-foreground" dateTime={lastReceivedAt}>
          {formatRelativeTime(lastReceivedAt)}
        </time>
      )}
    </div>
  );
}

function HealthPanel({ summary }: Readonly<{ summary: ProjectDashboardSummary }>) {
  return (
    <Panel>
      <PanelBar>
        <PanelSummary>Last event received</PanelSummary>
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
      <p className="font-mono text-[11px] text-muted-foreground">{formatWindowRange(summary)}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Error reports"
          total={summary.errorReports.total}
          trend={describeTrend(
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
