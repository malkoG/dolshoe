import { StatusDot, type statusBadgeVariants } from "./status-badge";
import type { VariantProps } from "class-variance-authority";

import { AttributeList, attributeEntries } from "./attribute-list";

type Tone = NonNullable<VariantProps<typeof statusBadgeVariants>["tone"]>;

const LEVEL_TONES: Record<string, Tone> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  warning: "warning",
  error: "danger",
  fatal: "danger",
};

export interface BreadcrumbEntry {
  /** Already formatted for display — this component stays timezone-agnostic. */
  timestamp: string;
  message?: string;
  category?: string;
  level?: string;
  data?: Readonly<Record<string, unknown>>;
}

/**
 * The oldest-first trail of small events leading up to a report.
 *
 * @remarks
 * No precedent existed for a timeline anywhere in this design system — this
 * is a first pass, deliberately plain: spaced rows with a level-colored dot,
 * not a connecting line or any of the polish a second pass might add once a
 * real screen has used this for a while.
 */
function BreadcrumbTimeline({ entries }: { entries: ReadonlyArray<BreadcrumbEntry> }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {entries.map((entry, index) => (
        <li className="flex items-start gap-3 py-2.5 text-[13px]" key={index}>
          <StatusDot className="mt-1.5" tone={LEVEL_TONES[entry.level ?? ""] ?? "neutral"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {entry.category != null && (
                <span className="font-mono text-[10px] text-faint uppercase">{entry.category}</span>
              )}
              <time className="font-mono text-[10px] text-muted-foreground">{entry.timestamp}</time>
            </div>
            {entry.message != null && <p className="mt-0.5 break-words">{entry.message}</p>}
            {entry.data != null && attributeEntries(entry.data).length > 0 && (
              <AttributeList
                background="muted"
                className="mt-1.5"
                entries={attributeEntries(entry.data)}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export { BreadcrumbTimeline };
