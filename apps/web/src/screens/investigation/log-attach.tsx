import { StatusBadge } from "@dolshoe/ui/components/status-badge";

import type { InvestigationLog } from "./types";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const LEVEL_TONES: Record<string, Tone> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  warning: "warning",
  error: "danger",
  fatal: "danger",
};

/**
 * A log record hung under the span it named.
 *
 * @remarks
 * Level tones follow the same six-value map as the breadcrumb timeline.
 * The row is not a LogRow — that component is the compact console line,
 * and this attach is a card beside an ErrorAttach.
 */
export function LogAttach({ log }: Readonly<{ log: InvestigationLog }>) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div className="flex w-[84px] shrink-0 flex-col gap-1">
        <StatusBadge>log</StatusBadge>
        <StatusBadge tone={LEVEL_TONES[log.level] ?? "neutral"}>{log.level}</StatusBadge>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm">{log.message}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint">
          <span>{log.category}</span>
          <span aria-hidden="true">·</span>
          <span>{log.service}</span>
        </p>
      </div>

      <span className="shrink-0 font-mono text-xs text-faint">{log.occurredLabel}</span>
    </div>
  );
}
