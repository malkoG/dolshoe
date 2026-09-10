import type { VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";
import { StatusBadge, type statusBadgeVariants } from "./status-badge";

type Tone = NonNullable<VariantProps<typeof statusBadgeVariants>["tone"]>;

/**
 * One line of a Logfire-style compact console: time · level · service ·
 * category · message (with its attributes inlined) · an attribute count ·
 * environment.
 *
 * @remarks
 * This is the collapsed state only — there is no separate "comfortable"
 * variant of this component to keep in sync with it. A caller that wants a
 * click-to-expand row renders its own wider row for the expanded record and
 * swaps between the two; `onClick` is this component's half of that toggle.
 */
function LogRow({
  attrsCount,
  category,
  className,
  environment,
  level,
  message,
  onClick,
  service,
  time,
  tone,
}: Readonly<{
  attrsCount?: number;
  category?: string;
  className?: string;
  environment?: string;
  level: string;
  message: string;
  onClick?: () => void;
  service: string;
  time: string;
  tone: Tone;
}>) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 border-b border-border bg-card px-4 py-[5px] text-left font-mono text-[12px] transition-colors last:border-b-0 hover:bg-muted",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <span className="w-[88px] shrink-0 text-faint">{time}</span>
      <StatusBadge className="w-16 shrink-0" tone={tone}>
        {level}
      </StatusBadge>
      <span className="w-28 shrink-0 truncate text-muted-foreground">{service}</span>
      {category != null && (
        <span className="hidden w-[140px] shrink-0 truncate text-faint sm:inline">{category}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-foreground">{message}</span>
      {attrsCount != null && attrsCount > 0 && (
        <span className="shrink-0 rounded-[4px] bg-muted px-1.5 py-px text-muted-foreground">
          +{attrsCount}
        </span>
      )}
      {environment != null && (
        <span className="hidden w-12 shrink-0 text-right text-faint sm:inline">{environment}</span>
      )}
    </button>
  );
}

export { LogRow };
