import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import {
  Panel,
  PanelBar,
  PanelControls,
  PanelFooter,
  PanelFooterNote,
  PanelSummary,
} from "@dolshoe/ui/components/panel";
import { SearchField } from "@dolshoe/ui/components/search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
import { cn } from "@dolshoe/ui/lib/utils";
import { ScrollText, Search } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { LogRecordRow } from "../../components/log-record-row";
import { RefreshButton } from "../../components/refresh-button";
import { pluralize } from "../../lib/format";
import type { LogLevel, LogRecordSummary } from "../../lib/log-records";
import { LogVolumeChart, type LogVolume, type LogVolumeRange } from "./log-volume-chart";
import { LogsConsole, type LogsConsoleState } from "./logs-console";
import { SegmentedControl } from "./segmented-control";

export const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warning", "error", "fatal"];

export type LogsDensity = "compact" | "comfortable";
export type LogsScreenStatus = "error" | "loading" | "ready";

export type LogsTrailCrumb = {
  label: string;
};

type LogsScreenBase = {
  /**
   * The live route sits inside PageShell, which already paints the trail.
   * Named states omit this so the silhouette can photograph the Figma bar.
   */
  embedded?: boolean;
  onRangeChange: (range: LogVolumeRange) => void;
  trail: readonly LogsTrailCrumb[];
  volume: LogVolume;
};

export type LogsListProps = LogsScreenBase & {
  density: LogsDensity;
  emptyAction?: ReactNode;
  errorDescription?: string;
  expandedRecordId?: string;
  filteredRecords: readonly LogRecordSummary[];
  level: LogLevel | "all";
  mode?: "list";
  onClearLevelFilter: () => void;
  onDensityChange: (density: LogsDensity) => void;
  onLevelChange: (level: LogLevel | "all") => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  query: string;
  records: readonly LogRecordSummary[];
  refreshing: boolean;
  status: LogsScreenStatus;
};

export type LogsLiveProps = LogsScreenBase & {
  console: LogsConsoleState;
  mode: "live";
  onClearLevelFilter?: () => void;
  onStopLive?: () => void;
};

export type LogsScreenProps = LogsListProps | LogsLiveProps;

const DENSITY_OPTIONS: ReadonlyArray<{ label: string; value: LogsDensity }> = [
  { label: "Compact", value: "compact" },
  { label: "Comfortable", value: "comfortable" },
];

/**
 * A project's Logs screen: the location trail, the volume chart, and
 * either the record list or the live-console stub.
 *
 * @remarks
 * Values in, pixels out. The route fetches; a construction test and a
 * silhouette inject a named state. Sidebar and page-shell stay where they
 * are. This view owns the Figma trail (org / project / Logs) so a
 * silhouette can photograph it without booting the shell.
 */
export function LogsScreen(props: LogsScreenProps) {
  const levelFilter = props.mode === "live" ? "all" : props.level;
  const last = props.trail.length - 1;
  const showTrail = props.embedded !== true && props.trail.length > 0;

  return (
    <div>
      {showTrail && (
        <TopBar
          trail={
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
              {props.trail.map((crumb, index) => (
                <Fragment key={`${crumb.label}:${index}`}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <Breadcrumb current={index === last}>{crumb.label}</Breadcrumb>
                </Fragment>
              ))}
            </nav>
          }
        />
      )}

      <div className={cn("flex flex-col gap-4", showTrail && "px-9 py-8")}>
        <PageHeading className="mb-0">Logs</PageHeading>

        <LogVolumeChart
          levelFilter={levelFilter}
          onClearLevelFilter={props.onClearLevelFilter ?? (() => undefined)}
          onRangeChange={props.onRangeChange}
          volume={props.volume}
        />

        {props.mode === "live" ? (
          <LogsConsole onStopLive={props.onStopLive} state={props.console} />
        ) : (
          <LogsListPanel {...props} />
        )}
      </div>
    </div>
  );
}

function LogsListPanel({
  density,
  emptyAction,
  errorDescription,
  expandedRecordId,
  filteredRecords,
  level,
  onDensityChange,
  onLevelChange,
  onQueryChange,
  onRefresh,
  query,
  records,
  refreshing,
  status,
}: LogsListProps) {
  return (
    <Panel>
      <PanelBar>
        <PanelSummary>
          {status === "ready" ? pluralize(records.length, "record") : "Logs"}
        </PanelSummary>

        <PanelControls>
          <SearchField
            label="Search log records"
            onValueChange={onQueryChange}
            placeholder="Search messages, categories…"
            value={query}
          />

          <Select
            onValueChange={(value) => onLevelChange(value === "all" ? "all" : (value as LogLevel))}
            value={level}
          >
            <SelectTrigger aria-label="Filter by severity" className="h-8 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {LOG_LEVELS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SegmentedControl
            label="Row density"
            onChange={onDensityChange}
            options={DENSITY_OPTIONS}
            value={density}
          />

          <RefreshButton
            label="Check for new records"
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
        </PanelControls>
      </PanelBar>

      <div aria-live="polite">
        {status === "loading" && (
          <DataState
            description="Fetching the newest records from the API."
            kind="loading"
            title="Loading log records…"
          />
        )}

        {status === "error" && (
          <DataState
            description={errorDescription ?? "Something went wrong while loading log records."}
            kind="error"
            onRetry={onRefresh}
            title="Couldn't load log records"
          />
        )}

        {status === "ready" && records.length === 0 && (
          <DataState
            action={level === "all" ? emptyAction : undefined}
            description={
              level === "all"
                ? "Structured logs travel over the same DSN a reporter already uses. Nothing has sent one to this project yet."
                : "Try a different severity."
            }
            icon={ScrollText}
            kind="empty"
            title={level === "all" ? "No log records yet" : `No ${level} records`}
          />
        )}

        {status === "ready" && records.length > 0 && filteredRecords.length === 0 && (
          <DataState
            description="Try another search."
            icon={Search}
            kind="empty"
            title="No matching records"
          />
        )}

        {status === "ready" && filteredRecords.length > 0 && (
          <ul>
            {filteredRecords.map((record) => (
              <LogRecordRow
                defaultExpanded={density === "comfortable" || record.id === expandedRecordId}
                key={`${record.id}:${density}`}
                record={record}
              />
            ))}
          </ul>
        )}
      </div>

      {status === "ready" && (
        <PanelFooter>
          <span>
            Showing <strong className="font-bold text-foreground">{filteredRecords.length}</strong>{" "}
            of {records.length} records
          </span>
          <PanelFooterNote>
            {level === "all" ? "Sorted newest first" : `level: ${level} · Sorted newest first`}
          </PanelFooterNote>
        </PanelFooter>
      )}
    </Panel>
  );
}
