import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * The surface almost every screen is built on: a white card lifted off the
 * paper, holding a bar of controls, a list, and a summarising footer.
 *
 * @remarks
 * Deliberately not built on `Card`. A `Card` pads its own content, which is
 * right for a form and wrong for a list whose rows have to reach the edges and
 * carry their own dividers. `Card` stays the primitive for padded content
 * boxes; this is the one for full-bleed lists.
 */
function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn(
        "overflow-hidden rounded-xl border border-input bg-card shadow-panel",
        className,
      )}
      {...props}
    />
  );
}

/** The panel's header strip: a count on the left, controls on the right. */
function PanelBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-bar"
      className={cn(
        "flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-border py-3 pr-3 pl-[18px]",
        className,
      )}
      {...props}
    />
  );
}

/** What the panel is showing, in words — "12 reports", "3 traces". */
function PanelSummary({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="panel-summary"
      className={cn("text-[11px] font-bold text-muted-foreground", className)}
      {...props}
    />
  );
}

/** The right-hand cluster of a panel bar: search, filters, a create form. */
function PanelControls({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-controls"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

/** A column header row for the list below it. */
function PanelListHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-list-header"
      className={cn(
        "min-h-9 items-center border-b border-border bg-muted px-5 font-mono text-[9px] font-medium tracking-[0.08em] text-faint uppercase",
        className,
      )}
      {...props}
    />
  );
}

/** The closing line: how much of the whole is on screen, and how it is ordered. */
function PanelFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="panel-footer"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted px-5 py-3 text-[11px] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A note that qualifies the footer's count, set quieter than the count itself. */
function PanelFooterNote({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="panel-footer-note"
      className={cn("font-mono text-[10px] text-faint", className)}
      {...props}
    />
  );
}

export {
  Panel,
  PanelBar,
  PanelControls,
  PanelFooter,
  PanelFooterNote,
  PanelListHeader,
  PanelSummary,
};
