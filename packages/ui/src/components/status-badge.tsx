import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * A small monospaced chip naming a state: a log level, a span kind, a role, a
 * deployment environment.
 *
 * @remarks
 * Separate from `Badge` because it answers a different question. `Badge` labels
 * a thing; this one grades it, so its colours come from the status palette and
 * its face is the mono one the app uses for machine values. The uniform width
 * keeps a column of them aligned when the words underneath vary in length.
 */
const statusBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-[5px] px-[7px] font-mono text-[9px] font-medium tracking-[0.06em] whitespace-nowrap uppercase",
  {
    variants: {
      tone: {
        neutral: "bg-secondary text-secondary-foreground",
        info: "bg-info-soft text-info",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-brand-soft text-brand",
        violet: "bg-violet-soft text-violet",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

function StatusBadge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusBadgeVariants>) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(statusBadgeVariants({ tone }), className)}
      {...props}
    />
  );
}

const statusDotVariants = cva("inline-block size-[7px] shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-faint",
      info: "bg-info",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-brand",
      violet: "bg-violet",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

/**
 * The dot that colours a deployment environment beside its name.
 *
 * @remarks
 * Neutral is a real answer here, not a fallback. The stylesheet this replaced
 * only had rules for `production` and `staging`, so every other environment
 * silently rendered as grey and looked identical to one that named no
 * environment at all. Callers now map their value to a tone themselves, which
 * makes "we have nothing to say about this one" a decision rather than a gap.
 */
function StatusDot({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusDotVariants>) {
  return (
    <span
      data-slot="status-dot"
      data-tone={tone}
      aria-hidden="true"
      className={cn(statusDotVariants({ tone }), className)}
      {...props}
    />
  );
}

export { StatusBadge, StatusDot, statusBadgeVariants };
