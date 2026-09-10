import { StatusBadge } from "@dolshoe/ui/components/status-badge";

import type { InvestigationError } from "./types";

/**
 * An error report hung under the span it named.
 *
 * @remarks
 * Private to Investigation. The "Open report →" control is a command port —
 * the view does not know the report route, only that the composition root
 * asked to be told when the reader wants it.
 */
export function ErrorAttach({
  error,
  onOpenReport,
}: Readonly<{
  error: InvestigationError;
  onOpenReport?: (reportId: string) => void;
}>) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div className="flex w-[84px] shrink-0 flex-col gap-1">
        <StatusBadge tone="danger">error</StatusBadge>
        <StatusBadge tone={error.handled ? "neutral" : "danger"}>
          {error.handled ? "handled" : "unhandled"}
        </StatusBadge>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{error.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint">
          <span className="font-mono">{error.source}</span>
          <span aria-hidden="true">·</span>
          <span>{error.service}</span>
          <span aria-hidden="true">·</span>
          <span>{error.occurredLabel}</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
        <span className="font-mono text-faint">{error.fingerprintLabel}</span>
        {onOpenReport != null ? (
          <button
            className="font-semibold text-brand"
            onClick={() => onOpenReport(error.reportId)}
            type="button"
          >
            Open report →
          </button>
        ) : (
          <span className="font-semibold text-brand">Open report →</span>
        )}
      </div>
    </div>
  );
}
