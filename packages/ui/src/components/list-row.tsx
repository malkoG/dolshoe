import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * One row of a `Panel`'s list — a `<li>` with the divider every row in this
 * design shares, so a row's own content never has to restate it.
 */
function ListRow({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("border-b border-border last:border-b-0", className)} {...props} />;
}

const listRowLinkVariants = cva(
  "flex flex-wrap items-center gap-x-4 gap-y-1 transition-colors hover:bg-muted",
  {
    variants: {
      density: {
        comfortable: "justify-between px-5 py-4",
        compact: "min-h-9 justify-between px-4 py-1.5 text-[12px]",
      },
    },
    defaultVariants: {
      density: "comfortable",
    },
  },
);

/**
 * The row's interactive surface. Pass `asChild` and wrap a router `Link` for
 * a navigating row — a `ProjectRow`, say — or omit it for a row that is not
 * itself a link, like most `MemberRow`s.
 *
 * @remarks
 * `compact` is a deliberate per-list choice (a dense console, a narrow
 * panel), not a breakpoint this switches on its own. Either density still
 * wraps its own content at narrow viewports via `flex-wrap` — that
 * responsiveness is free, not something a caller opts into separately.
 */
function ListRowLink({
  asChild = false,
  className,
  density,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof listRowLinkVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return <Comp className={cn(listRowLinkVariants({ density }), className)} {...props} />;
}

/** The row's leading block — a title and its subtext, truncating rather than pushing the row taller. */
function ListRowMain({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0", className)} {...props} />;
}

/** The row's trailing cluster — metadata, a status, a chevron. Wraps under `ListRowMain` when narrow. */
function ListRowMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("ml-auto flex flex-wrap items-center gap-x-4 gap-y-1", className)}
      {...props}
    />
  );
}

export { ListRow, ListRowLink, ListRowMain, ListRowMeta, listRowLinkVariants };
