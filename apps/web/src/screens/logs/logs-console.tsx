import { Panel, PanelFooter, PanelFooterNote } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { cn } from "@dolshoe/ui/lib/utils";
import { ChevronDown, Copy, ScrollText, X } from "lucide-react";

/**
 * One Logfire-style console line. Private to Logs — there is no live stream
 * yet, so this is the shape a named state paints, not a wire format.
 */
export interface LogsConsoleRow {
  childCount?: number;
  duration?: string;
  id: string;
  indent: boolean;
  kind: "log" | "span";
  message: string;
  offset: number;
  selected?: boolean;
  service: string;
  time: string;
  tone: "danger" | "info" | "warning";
  width: number;
}

export interface LogsConsoleDetail {
  argumentsJson: string;
  codeFile: string;
  codeLine: string;
  service: string;
  spanId: string;
  timestamp: string;
  title: string;
  traceId: string;
}

export interface LogsConsoleState {
  connected: boolean;
  detail: LogsConsoleDetail;
  footerNote: string;
  footerText: string;
  rows: readonly LogsConsoleRow[];
}

const TONE_FILL: Record<LogsConsoleRow["tone"], string> = {
  danger: "bg-brand",
  info: "bg-info",
  warning: "bg-warning",
};

/**
 * The live console + detail drawer stub.
 *
 * @remarks
 * The route does not open a socket. This paints the Figma layout from props
 * so a silhouette can photograph it, and so the list mode does not have to
 * grow a second page-shell around a feed that does not exist yet.
 */
export function LogsConsole({
  onStopLive,
  state,
}: Readonly<{
  onStopLive?: () => void;
  state: LogsConsoleState;
}>) {
  return (
    <Panel className="flex flex-col overflow-hidden lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex h-12 items-center gap-3 border-b border-border px-3">
          <Button onClick={onStopLive} size="xs" type="button" variant="destructive">
            Stop live
          </Button>
          <p className="text-[12px] font-medium text-muted-foreground">
            {state.connected ? "Connected" : "Disconnected"}
          </p>
          <span className="min-w-0 flex-1" />
          <StubMenu label="Visibility" />
          <StubMenu label="Custom levels" />
        </div>

        <div className="flex flex-col items-center gap-2 border-b border-border py-3">
          <p className="text-[12px] font-medium text-muted-foreground">
            No older items in the selected time window.
          </p>
          <span className="rounded-full bg-muted px-3 py-1 text-[12px] font-semibold text-muted-foreground">
            Today
          </span>
        </div>

        <ul>
          {state.rows.map((row) => (
            <ConsoleRow key={row.id} row={row} />
          ))}
        </ul>

        <PanelFooter>
          <span>{state.footerText}</span>
          <PanelFooterNote>{state.footerNote}</PanelFooterNote>
        </PanelFooter>
      </div>

      <DetailDrawer detail={state.detail} />
    </Panel>
  );
}

function StubMenu({ label }: Readonly<{ label: string }>) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium">
      {label}
      <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
    </span>
  );
}

function ConsoleRow({ row }: Readonly<{ row: LogsConsoleRow }>) {
  const fill = TONE_FILL[row.tone];

  return (
    <li
      className={cn(
        "flex h-[26px] items-center gap-2 border-b border-border px-3 font-mono text-[12px]",
        row.selected && "bg-surface-inset",
      )}
    >
      <span className="w-16 shrink-0 text-faint">{row.time}</span>
      <span className="flex h-[18px] w-20 shrink-0 items-center justify-center overflow-hidden rounded-xs bg-info-soft px-1.5 text-info">
        {row.service}
      </span>
      {row.indent && <span aria-hidden="true" className="w-5 shrink-0" />}
      <span className="flex h-[18px] w-7 shrink-0 items-center justify-center">
        {row.kind === "span" ? (
          <span className="rounded-xs border border-info px-1 text-info">
            {row.childCount ?? 0}−
          </span>
        ) : (
          <span aria-hidden="true" className={cn("size-[7px] rotate-45", fill)} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{row.message}</span>
      <span className="relative flex h-[18px] w-[220px] shrink-0 items-center">
        <span aria-hidden="true" className="absolute inset-x-0 top-[9px] h-px bg-border" />
        <span
          aria-hidden="true"
          className="absolute top-0 flex h-full items-center"
          style={{ left: `${Math.min(100, Math.max(0, row.offset * 100))}%` }}
        >
          {row.kind === "span" ? (
            <span
              className={cn("h-1 rounded-[2px]", fill)}
              style={{ width: `${Math.max(4, row.width * 220)}px` }}
            />
          ) : (
            <span className={cn("h-2.5 w-0.5", fill)} />
          )}
        </span>
      </span>
      <span className="w-14 shrink-0 text-right text-muted-foreground">{row.duration ?? ""}</span>
    </li>
  );
}

function DetailDrawer({ detail }: Readonly<{ detail: LogsConsoleDetail }>) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-border p-4 lg:w-[380px] lg:border-t-0 lg:border-l">
      <div className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand">
          <ScrollText aria-hidden="true" className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-muted-foreground">Log:</p>
          <p className="text-[14px] font-semibold">{detail.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Copy log"
            onClick={() => {
              void navigator.clipboard.writeText(detail.title);
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button aria-label="Close detail" size="icon-xs" type="button" variant="ghost">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <IdChip label="Service name" value={detail.service} />
        <IdChip label="Trace id" value={`#${detail.traceId}`} />
        <IdChip label="Span id" value={`#${detail.spanId}`} />
        <IdChip label="Timestamp" value={detail.timestamp} />
      </div>

      <div className="flex gap-4 border-b border-border">
        <span className="border-b-2 border-foreground pb-1.5 text-[12px] font-semibold">
          Details
        </span>
        <span className="pb-1.5 text-[12px] font-medium text-muted-foreground">Raw data</span>
      </div>

      <p className="text-[14px] font-semibold">Arguments (as JSON)</p>
      <pre className="overflow-x-auto rounded-md bg-surface-inset p-3 font-mono text-[12px] leading-[18px]">
        {detail.argumentsJson}
      </pre>

      <p className="text-[14px] font-semibold">Code details</p>
      <div className="flex gap-2 text-[12px]">
        <span className="w-[110px] shrink-0 font-medium text-muted-foreground">Code filepath</span>
        <span className="font-mono">{detail.codeFile}</span>
      </div>
      <div className="flex gap-2 text-[12px]">
        <span className="w-[110px] shrink-0 font-medium text-muted-foreground">Code lineno</span>
        <span className="font-mono">{detail.codeLine}</span>
      </div>
    </aside>
  );
}

function IdChip({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-xs bg-info-soft px-1.5 py-0.5 text-[12px]">
      <span className="font-medium text-info">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}
