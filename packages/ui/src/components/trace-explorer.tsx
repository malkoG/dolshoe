import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * The two-pane shell a stack trace is read in: a stacked aside on the left,
 * the frames it selects on the right.
 *
 * @remarks
 * One column does not survive a real failure. A chain of four exceptions with
 * two hundred frames between them is thousands of pixels of scroll in which
 * every landmark is off screen, and the reader loses track of which exception
 * they are inside. Stacking the chain in an aside makes the shape of the
 * failure visible at a glance and turns "go back and look at the cause" into
 * one click rather than a scroll hunt.
 *
 * Below the medium breakpoint the two panes become one column, aside first —
 * a narrow screen has no room for both, and the chain is the part worth seeing
 * before committing to a scroll.
 */
function TraceExplorer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid md:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]", className)}
      data-slot="trace-explorer"
      {...props}
    />
  );
}

/** The stacked left rail: every exception in the chain, and its runs of frames. */
function TraceAside({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      className={cn("border-b border-border bg-muted py-2 md:border-r md:border-b-0", className)}
      data-slot="trace-aside"
      {...props}
    />
  );
}

/** One exception's worth of aside items, under a label saying why it is here. */
function TraceAsideSection({
  relation,
  title,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { relation?: string; title: string }) {
  return (
    <div className={cn("px-2 py-1.5", className)} data-slot="trace-aside-section" {...props}>
      {relation != null && (
        <span className="block px-2 font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
          {relation}
        </span>
      )}
      <span className="mt-0.5 block truncate px-2 text-[12px] font-bold" title={title}>
        {title}
      </span>
      <ul className="mt-1.5 flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

/**
 * One selectable run of frames.
 *
 * @remarks
 * The count sits in the item rather than in the content heading because it is
 * what the reader is choosing between: "two of ours, then eleven of the
 * framework's" is the shape of the failure, readable without opening anything.
 */
function TraceAsideItem({
  count,
  selected = false,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { count: number; selected?: boolean }) {
  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
          selected
            ? "bg-card font-bold text-foreground shadow-panel"
            : "text-muted-foreground hover:bg-secondary",
          className,
        )}
        data-slot="trace-aside-item"
        type="button"
        {...props}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        <span className="shrink-0 font-mono text-[10px] text-faint">{count}</span>
      </button>
    </li>
  );
}

/** The right-hand pane: whatever the aside currently points at. */
function TraceContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0 bg-card", className)} data-slot="trace-content" {...props} />;
}

export { TraceAside, TraceAsideItem, TraceAsideSection, TraceContent, TraceExplorer };
