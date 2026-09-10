import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { cn } from "@dolshoe/ui/lib/utils";

import { SpanKindBadge } from "../../components/span-kind-badge";
import { spanDurationLabel } from "./from-trace";
import type { InvestigationSpan } from "./types";

/** Narrow enough that a deep trace still leaves room for the bar. */
const INDENT_PER_LEVEL = 14;
/** Figma's waterfall track — bar width and inset are a fraction of this. */
const TRACK_PX = 220;
/** A span far shorter than the trace would otherwise be an invisible bar. */
const MINIMUM_BAR_PERCENT = 0.4;

export function barGeometry(
  span: Pick<InvestigationSpan, "startOffsetNanoseconds" | "durationNanoseconds">,
  traceDuration: number,
): { left: number; width: number } {
  if (traceDuration <= 0 || span.durationNanoseconds == null) {
    return { left: 0, width: 100 };
  }

  const left = (span.startOffsetNanoseconds / traceDuration) * 100;
  const width = Math.max((span.durationNanoseconds / traceDuration) * 100, MINIMUM_BAR_PERCENT);

  return { left: Math.min(left, 100 - MINIMUM_BAR_PERCENT), width };
}

/**
 * One span in the Investigation tree.
 *
 * @remarks
 * Axes match Figma's SpanRow: status, depth, and whether the parent was
 * stored. The waterfall track is a fixed 220px; the bar's inset and width
 * are the span's offset and duration as a fraction of the trace.
 */
export function SpanRow({
  expanded,
  onToggle,
  span,
  traceDuration,
}: Readonly<{
  expanded: boolean;
  onToggle?: () => void;
  span: InvestigationSpan;
  traceDuration: number;
}>) {
  const { left, width } = barGeometry(span, traceDuration);
  const failed = span.statusCode === "error";
  const barTone =
    span.statusCode === "error" ? "bg-brand" : span.statusCode === "ok" ? "bg-success" : "bg-faint";

  return (
    <button
      aria-expanded={expanded}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left"
      onClick={onToggle}
      type="button"
    >
      {span.depth > 0 && (
        <>
          <span
            aria-hidden="true"
            className="shrink-0"
            style={{ width: span.depth * INDENT_PER_LEVEL }}
          />
          <span aria-hidden="true" className="font-mono text-xs text-faint">
            └
          </span>
        </>
      )}

      <span
        className={cn("truncate text-sm font-semibold", failed && "text-brand")}
        title={span.name}
      >
        {span.name}
      </span>
      <SpanKindBadge kind={span.kind} />
      {failed && <StatusBadge tone="danger">error</StatusBadge>}
      {span.parentMissing && <StatusBadge tone="warning">parent pending</StatusBadge>}

      <span className="min-w-0 flex-1" />

      <span className="hidden shrink-0 text-xs text-faint sm:inline">{span.serviceName}</span>
      <span
        className="relative hidden h-1.5 shrink-0 overflow-hidden rounded-full bg-surface-inset sm:block"
        style={{ width: TRACK_PX }}
      >
        <span
          className={cn("absolute inset-y-0 rounded-full", barTone)}
          style={{ insetInlineStart: `${left}%`, width: `${width}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">
        {spanDurationLabel(span.durationNanoseconds)}
      </span>
    </button>
  );
}
