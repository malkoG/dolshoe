import { Panel, PanelBar } from "@dolshoe/ui/components/panel";
import { cn } from "@dolshoe/ui/lib/utils";
import { X } from "lucide-react";

import { pluralize } from "../../lib/format";
import type { LogLevel } from "../../lib/log-records";
import { SegmentedControl } from "./segmented-control";

export const LOG_VOLUME_RANGES = ["1h", "24h", "7d"] as const;

export type LogVolumeRange = (typeof LOG_VOLUME_RANGES)[number];

export interface LogVolumeBucket {
  errors: number;
  label: string;
  logs: number;
}

/**
 * The histogram a Logs screen can paint without asking the API for a series.
 *
 * @remarks
 * Volume is not a list-records field. The route can derive a coarse series
 * from whatever it already loaded; a named-state factory supplies the Figma
 * numbers. Either way the chart only ever receives buckets.
 */
export interface LogVolume {
  buckets: readonly LogVolumeBucket[];
  range: LogVolumeRange;
  subtitle: string;
  totals: { errors: number; logs: number };
}

const CHART_WIDTH = 850;
const CHART_BAR_AREA_HEIGHT = 108;
const CHART_LABEL_ROW_HEIGHT = 18;
const CHART_HEIGHT = CHART_BAR_AREA_HEIGHT + CHART_LABEL_ROW_HEIGHT;
const BAR_RADIUS = 4;
const SERIES_GAP = 2;

const RANGE_OPTIONS = LOG_VOLUME_RANGES.map((value) => ({ label: value, value }));

const FILTERED_BAR_CLASS: Record<LogLevel, string> = {
  debug: "fill-faint",
  error: "fill-chart-error",
  fatal: "fill-chart-error",
  info: "fill-chart-logs",
  trace: "fill-faint",
  warning: "fill-warning",
};

const LEVEL_CHIP_CLASS: Record<LogLevel, string> = {
  debug: cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] tracking-[0.06em] uppercase",
    "bg-secondary text-secondary-foreground",
  ),
  error: cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] tracking-[0.06em] uppercase",
    "bg-brand-soft text-brand",
  ),
  fatal: cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] tracking-[0.06em] uppercase",
    "bg-brand-soft text-brand",
  ),
  info: cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] tracking-[0.06em] uppercase",
    "bg-info-soft text-info",
  ),
  trace: cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] tracking-[0.06em] uppercase",
    "bg-secondary text-secondary-foreground",
  ),
  warning: cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9px] tracking-[0.06em] uppercase",
    "bg-warning-soft text-warning",
  ),
};

function roundedTopBarPath(x: number, top: number, width: number, bottom: number): string {
  const radius = Math.min(BAR_RADIUS, Math.max(0, bottom - top));
  if (bottom - top <= 0) return "";

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

function yTicks(maxValue: number): [number, number, number] {
  if (maxValue <= 0) return [0, 0, 0];
  const top = niceCeiling(maxValue);
  return [top, top / 2, 0];
}

function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function tickLabels(buckets: readonly LogVolumeBucket[]): number[] {
  if (buckets.length <= 1) return [0];
  const step = buckets.length >= 24 ? 4 : Math.max(1, Math.floor(buckets.length / 6));
  const indexes: number[] = [];
  for (let index = 0; index < buckets.length; index += step) indexes.push(index);
  return indexes;
}

/**
 * Hourly (or otherwise bucketed) log volume for the Logs route.
 *
 * @remarks
 * Filtered (a severity is on) is a single series in that level's tone, with
 * the chip that clears it. Unfiltered stacks logs above errors with a 2px
 * gap so the two series stay separable — the Figma chart/logs vs chart/error
 * pairing, not a second palette.
 */
export function LogVolumeChart({
  levelFilter,
  onClearLevelFilter,
  onRangeChange,
  volume,
}: Readonly<{
  levelFilter: LogLevel | "all";
  onClearLevelFilter: () => void;
  onRangeChange: (range: LogVolumeRange) => void;
  volume: LogVolume;
}>) {
  const filtered = levelFilter !== "all";
  const buckets = volume.buckets;
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.logs + bucket.errors));
  const [topTick, midTick, baseTick] = yTicks(maxValue);
  const scaleMax = topTick === 0 ? 1 : topTick;
  const groupWidth = buckets.length === 0 ? 0 : CHART_WIDTH / buckets.length;
  const barWidth = Math.max(4, Math.min(22, groupWidth - 8));
  const labels = tickLabels(buckets);
  const summaryLabel = `Log volume, ${volume.subtitle}: ${pluralize(
    volume.totals.logs,
    "log",
  )} and ${pluralize(volume.totals.errors, "error")} in total.`;

  return (
    <Panel>
      <PanelBar className="min-h-0 border-b-0 py-0">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">Volume</p>
            <p className="text-[12px] font-medium text-faint">{volume.subtitle}</p>
          </div>
          {filtered && (
            <button
              className={LEVEL_CHIP_CLASS[levelFilter]}
              onClick={onClearLevelFilter}
              type="button"
            >
              level: {levelFilter}
              <X aria-hidden="true" className="size-3" />
              <span className="sr-only">Clear level filter</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <p className="text-[12px] font-semibold">
            {volume.totals.logs.toLocaleString()} logs · {volume.totals.errors.toLocaleString()}{" "}
            errors
          </p>
          <SegmentedControl
            label="Volume range"
            onChange={onRangeChange}
            options={RANGE_OPTIONS}
            value={volume.range}
          />
        </div>
      </PanelBar>

      {buckets.length === 0 ? (
        <p className="px-5 pb-4 text-[13px] text-muted-foreground">
          No volume for this window yet.
        </p>
      ) : (
        <div className="flex gap-2 px-5 pb-4">
          <div
            aria-hidden="true"
            className="relative h-[108px] w-8 shrink-0 font-mono text-[12px] text-faint"
          >
            <span className="absolute top-[-9px] right-0">{topTick}</span>
            <span className="absolute top-[45px] right-0">{midTick}</span>
            <span className="absolute top-[99px] right-0">{baseTick}</span>
          </div>

          <svg
            aria-label={summaryLabel}
            className="h-auto min-w-0 flex-1"
            role="img"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          >
            <line
              aria-hidden="true"
              className="stroke-chart-grid"
              strokeWidth={1}
              x1={0}
              x2={CHART_WIDTH}
              y1={0}
              y2={0}
            />
            <line
              aria-hidden="true"
              className="stroke-chart-grid"
              strokeWidth={1}
              x1={0}
              x2={CHART_WIDTH}
              y1={CHART_BAR_AREA_HEIGHT / 2}
              y2={CHART_BAR_AREA_HEIGHT / 2}
            />
            <line
              aria-hidden="true"
              className="stroke-faint"
              strokeWidth={1}
              x1={0}
              x2={CHART_WIDTH}
              y1={CHART_BAR_AREA_HEIGHT}
              y2={CHART_BAR_AREA_HEIGHT}
            />

            {buckets.map((bucket, index) => {
              const groupX = index * groupWidth;
              const barX = groupX + (groupWidth - barWidth) / 2;
              const total = bucket.logs + bucket.errors;
              const filteredHeight = (total / scaleMax) * CHART_BAR_AREA_HEIGHT;
              const errorHeight = (bucket.errors / scaleMax) * CHART_BAR_AREA_HEIGHT;
              const logsHeight = (bucket.logs / scaleMax) * CHART_BAR_AREA_HEIGHT;
              const errorTop = CHART_BAR_AREA_HEIGHT - errorHeight;
              const logsBottom = errorTop - (errorHeight > 0 && logsHeight > 0 ? SERIES_GAP : 0);
              const logsTop = logsBottom - logsHeight;

              return (
                <g key={`${bucket.label}-${index}`}>
                  {filtered ? (
                    total > 0 && (
                      <path
                        aria-hidden="true"
                        className={FILTERED_BAR_CLASS[levelFilter]}
                        d={roundedTopBarPath(
                          barX,
                          CHART_BAR_AREA_HEIGHT - filteredHeight,
                          barWidth,
                          CHART_BAR_AREA_HEIGHT,
                        )}
                      />
                    )
                  ) : (
                    <>
                      {bucket.errors > 0 && (
                        <path
                          aria-hidden="true"
                          className="fill-chart-error"
                          d={roundedTopBarPath(barX, errorTop, barWidth, CHART_BAR_AREA_HEIGHT)}
                        />
                      )}
                      {bucket.logs > 0 && (
                        <path
                          aria-hidden="true"
                          className="fill-chart-logs"
                          d={roundedTopBarPath(barX, logsTop, barWidth, logsBottom)}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}

            {labels.map((index) => {
              const bucket = buckets[index];
              if (bucket == null) return null;
              return (
                <text
                  aria-hidden="true"
                  className="fill-faint font-mono text-[12px]"
                  key={`label-${bucket.label}-${index}`}
                  textAnchor="start"
                  x={index * groupWidth}
                  y={CHART_HEIGHT - 2}
                >
                  {bucket.label}
                </text>
              );
            })}
          </svg>
        </div>
      )}

      {!filtered && buckets.length > 0 && (
        <div className="flex items-center gap-4 px-5 pb-4 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-chart-logs" />
            Logs
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-chart-error" />
            Errors
          </span>
        </div>
      )}
    </Panel>
  );
}

export function emptyLogVolume(range: LogVolumeRange = "24h"): LogVolume {
  return {
    buckets: hourlyLabels().map((label) => ({ errors: 0, label, logs: 0 })),
    range,
    subtitle: subtitleFor(range),
    totals: { errors: 0, logs: 0 },
  };
}

export function subtitleFor(range: LogVolumeRange): string {
  if (range === "1h") return "Last 1 hour · 5-min buckets";
  if (range === "7d") return "Last 7 days · 1d buckets";
  return "Last 24 hours · 1h buckets";
}

function hourlyLabels(): string[] {
  return Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
}

/**
 * A coarse histogram from the records the list already has.
 *
 * @remarks
 * There is no volume endpoint yet. Bucketing the newest page is honest about
 * what the screen knows, and it is enough for the chart to have a shape
 * while that stays true.
 */
export function volumeFromRecords(
  records: readonly { level: LogLevel; occurredAt: string }[],
  range: LogVolumeRange,
): LogVolume {
  const labels =
    range === "7d"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : range === "1h"
        ? Array.from({ length: 12 }, (_, index) => `${String(index * 5).padStart(2, "0")}m`)
        : hourlyLabels();

  const buckets = labels.map((label) => ({ errors: 0, label, logs: 0 }));
  const now = Date.now();
  const windowMs =
    range === "1h"
      ? 60 * 60 * 1000
      : range === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  const bucketMs = windowMs / buckets.length;

  for (const record of records) {
    const age = now - new Date(record.occurredAt).getTime();
    if (age < 0 || age >= windowMs) continue;
    const index = Math.min(buckets.length - 1, Math.floor((windowMs - age) / bucketMs));
    const bucket = buckets[index];
    if (bucket == null) continue;
    bucket.logs += 1;
    if (record.level === "error" || record.level === "fatal") bucket.errors += 1;
  }

  const logs = records.length;
  const errors = records.filter(
    (record) => record.level === "error" || record.level === "fatal",
  ).length;

  return {
    buckets,
    range,
    subtitle: subtitleFor(range),
    totals: { errors, logs },
  };
}
