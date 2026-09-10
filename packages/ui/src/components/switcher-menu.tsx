import { cva } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * The popover a sidebar switcher opens: an eyebrow label, a list of items,
 * a full-width divider, then one or two stacked actions.
 *
 * @remarks
 * Shared between the organization and project switchers rather than built
 * twice — the two lists are the same shape (a colored initial, a name, an
 * optional status pill, a current-item check) and would only drift if kept
 * separate. A caller owns the `<details>`/`<summary>` disclosure and
 * positions this absolutely under its trigger.
 */
function SwitcherMenu({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="switcher-menu"
      className={cn(
        "absolute top-full left-0 z-30 mt-2 w-[272px] overflow-hidden rounded-lg border border-border bg-card shadow-panel",
        className,
      )}
      {...props}
    />
  );
}

function SwitcherMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="switcher-menu-label"
      className={cn(
        "px-3 pt-3 pb-1 font-mono text-[9px] font-medium tracking-[0.06em] text-faint uppercase",
        className,
      )}
      {...props}
    />
  );
}

function SwitcherMenuList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="switcher-menu-list"
      className={cn("flex flex-col gap-0.5 p-1", className)}
      {...props}
    />
  );
}

const switcherMenuItemVariants = cva(
  "flex items-center gap-2 rounded-md p-2 text-[12px] font-medium text-foreground hover:bg-secondary",
  {
    variants: {
      current: {
        true: "bg-secondary font-semibold",
        false: "",
      },
    },
    defaultVariants: {
      current: false,
    },
  },
);

/**
 * The colored initial square inside a switcher row. Separate from `Avatar`
 * because it is always a single letter on a flat tone, never an image — the
 * caller picks the tone (`bg-brand`, `bg-info`, …) to match its entity.
 */
function SwitcherMenuItemMark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="switcher-menu-item-mark"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-[4px] bg-brand text-[12px] font-semibold text-brand-on",
        className,
      )}
      {...props}
    />
  );
}

/** The name text inside a switcher row — truncates rather than wrapping the row taller. */
function SwitcherMenuItemLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="switcher-menu-item-label"
      className={cn("min-w-0 flex-1 truncate", className)}
      {...props}
    />
  );
}

/** A role or status pill at the end of a row — reuses the muted chip look, not `StatusBadge`'s tones. */
function SwitcherMenuItemBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="switcher-menu-item-badge"
      className={cn(
        "shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] font-medium tracking-[0.06em] text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}

/** The check beside the current item — decorative, `aria-current` on the row already says this. */
function SwitcherMenuItemCheck({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="switcher-menu-item-check"
      className={cn("shrink-0 text-[12px] font-semibold text-foreground", className)}
      {...props}
    >
      ✓
    </span>
  );
}

function SwitcherMenuDivider({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="switcher-menu-divider" className={cn("h-px bg-border", className)} {...props} />
  );
}

function SwitcherMenuActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="switcher-menu-actions"
      className={cn("flex flex-col gap-0.5 p-1", className)}
      {...props}
    />
  );
}

const switcherMenuActionVariants = cva(
  "flex items-center gap-2 rounded-md px-2 py-2.5 text-[12px] font-semibold text-foreground hover:bg-secondary [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
);

export {
  SwitcherMenu,
  SwitcherMenuActions,
  SwitcherMenuDivider,
  SwitcherMenuItemBadge,
  SwitcherMenuItemCheck,
  SwitcherMenuItemLabel,
  SwitcherMenuItemMark,
  SwitcherMenuLabel,
  SwitcherMenuList,
  switcherMenuActionVariants,
  switcherMenuItemVariants,
};
