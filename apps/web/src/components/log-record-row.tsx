import { AttributeList, attributeEntries } from "@dolshoe/ui/components/attribute-list";
import { LogRow } from "@dolshoe/ui/components/log-row";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Clock3 } from "lucide-react";
import { useState } from "react";

import { formatClockTime, formatRelativeTime } from "../lib/format";
import type { LogLevel, LogRecordSummary } from "../lib/log-records";

/** How loudly each severity is allowed to shout. */
const LEVEL_TONES: Record<LogLevel, "neutral" | "info" | "warning" | "danger"> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  warning: "warning",
  error: "danger",
  fatal: "danger",
};

/**
 * One log record: a Logfire-style compact console line by default, that
 * expands into the fuller row (message, meta line, attribute pills) on
 * click and collapses back on a second click.
 *
 * @remarks
 * Owns its own expanded/collapsed state rather than lifting it to the list.
 * Nothing above this needs to know which rows are open — a shared "which
 * ids are expanded" set would only exist to serve this one component.
 *
 * The muted fill is the expanded (or defaultExpanded) surface only.
 * A collapsed console line stays on the card.
 */
export function LogRecordRow({
  defaultExpanded = false,
  record,
}: Readonly<{ defaultExpanded?: boolean; record: LogRecordSummary }>) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tone = LEVEL_TONES[record.level];
  const attrs = attributeEntries(record.attributes);

  if (!expanded) {
    return (
      <li>
        <LogRow
          attrsCount={attrs.length}
          category={record.category.length > 0 ? record.category.join(".") : undefined}
          className="bg-card"
          environment={record.service.environment}
          level={record.level}
          message={record.message}
          onClick={() => setExpanded(true)}
          service={record.service.name}
          time={formatClockTime(record.occurredAt)}
          tone={tone}
        />
      </li>
    );
  }

  return (
    <li>
      <button
        className="grid w-full grid-cols-1 gap-x-4 gap-y-2 border-b border-border bg-muted px-5 py-4 text-left last:border-b-0 hover:bg-muted sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-start"
        onClick={() => setExpanded(false)}
        type="button"
      >
        <StatusBadge className="w-full sm:w-16" tone={tone}>
          {record.level}
        </StatusBadge>

        <div className="min-w-0">
          <p className="text-[13px] break-words">{record.message}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <strong className="font-bold text-foreground">{record.service.name}</strong>
            {record.category.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <code className="font-mono text-[10px]">{record.category.join(".")}</code>
              </>
            )}
            {record.service.environment && (
              <>
                <span aria-hidden="true">·</span>
                {record.service.environment}
              </>
            )}
          </div>
          {attrs.length > 0 && (
            <AttributeList background="muted" className="mt-2" entries={attrs} />
          )}
        </div>

        <span className="flex items-center gap-1.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
          <Clock3 className="size-3.5" />
          <time dateTime={record.occurredAt} title={record.occurredAt}>
            {formatRelativeTime(record.occurredAt)}
          </time>
        </span>
      </button>
    </li>
  );
}
