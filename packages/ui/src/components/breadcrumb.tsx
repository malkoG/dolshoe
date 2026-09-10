import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * One step of the page's location trail — plain text, never a dropdown.
 *
 * @remarks
 * Org and project switching live in the sidebar; a breadcrumb only ever
 * says where you are and lets you step back up. `current` renders the page
 * itself, which is not a link — pass `asChild` on every other step and wrap
 * a router `Link`.
 */
function Breadcrumb({
  asChild = false,
  className,
  current = false,
  ...props
}: React.ComponentProps<"span"> & { asChild?: boolean; current?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-current={current ? "true" : undefined}
      data-slot="breadcrumb"
      className={cn(
        "rounded-sm px-2 py-1 text-[12px] font-medium text-muted-foreground",
        current
          ? "font-semibold text-foreground"
          : "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** The "/" between two `Breadcrumb`s — a separate node so it never inherits link styling. */
function BreadcrumbSeparator({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="breadcrumb-separator"
      className={cn("text-[12px] text-faint", className)}
      {...props}
    >
      /
    </span>
  );
}

/**
 * The 56px bar above every screen's content. `trail` is composed per-route
 * from `Breadcrumb`/`BreadcrumbSeparator`; `actions` is the right-hand
 * cluster and is optional — most routes have nothing to put there yet.
 */
function TopBar({
  actions,
  className,
  trail,
  ...props
}: Readonly<
  Omit<React.ComponentProps<"div">, "children"> & {
    actions?: React.ReactNode;
    trail: React.ReactNode;
  }
>) {
  return (
    <div
      data-slot="top-bar"
      className={cn(
        "sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-card px-7",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">{trail}</div>
      {actions}
    </div>
  );
}

export { Breadcrumb, BreadcrumbSeparator, TopBar };
