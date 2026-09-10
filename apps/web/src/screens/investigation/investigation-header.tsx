import { useEffect, useRef, useState } from "react";

import { formatDuration } from "../../lib/format";
import { formatSpanCountLabel, formatTraceChip, formatTruncatedBanner } from "./format";
import type { Investigation } from "./types";

/**
 * Title, trace id, and the counts that say whether this investigation is
 * whole, truncated, or still missing a parent.
 */
export function InvestigationHeader({ investigation }: Readonly<{ investigation: Investigation }>) {
  const incomplete = investigation.missingParentCount > 0;
  const spanCountLabel = formatSpanCountLabel(
    investigation.shownSpanCount,
    investigation.totalSpanCount,
    investigation.truncated,
  );

  return (
    <header className="flex flex-col gap-3 rounded-xl border border-border bg-card px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] leading-10 font-bold tracking-[-0.5px]">Investigation</h1>
        <TraceIdChip traceId={investigation.traceId} />
        {incomplete && (
          <span className="inline-flex items-center rounded-md bg-info-soft px-2 py-1 text-xs font-medium text-info">
            Incomplete — parents may still arrive
          </span>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{spanCountLabel}</span>
        {investigation.failingCount > 0 && (
          <>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span className="font-semibold text-brand">{investigation.failingCount} failing</span>
          </>
        )}
        <span aria-hidden="true" className="text-faint">
          ·
        </span>
        <span>{formatDuration(investigation.durationNanoseconds)}</span>
        <span aria-hidden="true" className="text-faint">
          ·
        </span>
        <span>{investigation.startedLabel}</span>
      </p>

      {investigation.truncated && (
        <p className="rounded-md bg-warning-soft px-4 py-3 text-xs text-warning">
          {formatTruncatedBanner(investigation.shownSpanCount)}
        </p>
      )}
    </header>
  );
}

function TraceIdChip({ traceId }: Readonly<{ traceId: string }>) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(traceId);
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className="inline-flex items-center gap-1 rounded-sm bg-surface-inset px-2 py-1 font-mono text-xs"
      onClick={() => void copy()}
      type="button"
      aria-label={copied ? "Trace id copied" : `Copy trace id ${traceId}`}
    >
      <span>{formatTraceChip(traceId)}</span>
      <span aria-hidden="true" className="text-faint">
        {copied ? "✓" : "⧉"}
      </span>
    </button>
  );
}
