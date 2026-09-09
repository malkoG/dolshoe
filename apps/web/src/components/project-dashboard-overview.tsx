import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";

import type { ProjectDashboardSummary } from "../lib/dashboard-summary";
import { dateFormatter, formatRelativeTime, pluralize } from "../lib/format";

/**
 * A project's landing screen.
 *
 * @remarks
 * This is layout, not the finished widgets: each slot below renders the
 * summary's own numbers as plainly as possible — a list, not a chart. The
 * point of this pass is the grid and the props contract it is built on
 * (`ProjectDashboardSummary`, already frozen in `lib/dashboard-summary.ts`).
 * Turning each slot into something worth looking at is later, separate work,
 * one slot at a time.
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

function VolumeSeriesPanel({ summary }: Readonly<{ summary: ProjectDashboardSummary }>) {
  return (
    <Panel>
      <PanelBar>
        <PanelSummary>Daily volume</PanelSummary>
      </PanelBar>
      {summary.volumeSeries.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted-foreground">No data for this window yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {summary.volumeSeries.map((bucket) => (
            <li
              className="flex items-center justify-between px-5 py-2.5 text-[13px]"
              key={bucket.bucketStart}
            >
              <span>{dateFormatter.format(new Date(bucket.bucketStart))}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {pluralize(bucket.errorReports, "error")} · {pluralize(bucket.logRecords, "log")}
              </span>
            </li>
          ))}
        </ul>
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
