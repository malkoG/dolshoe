import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * The `<details>` wrapping an organization switcher: the sidebar header's
 * brand mark opens the menu, with no separate switcher button.
 *
 * @remarks
 * A `<details>` rather than a popover library, for the same reason the
 * account menu already uses one: free keyboard access and outside-click
 * dismissal, for a menu that holds a short list and two actions.
 */
function OrgSwitcher({ className, ...props }: React.ComponentProps<"details">) {
  return (
    <details data-slot="org-switcher" className={cn("group relative", className)} {...props} />
  );
}

/**
 * The square mark itself — click target and visual identity at once.
 * `State=hover` and `State=open` are a border ring, not a background change,
 * so the brand fill stays legible against the dark sidebar underneath it.
 */
function OrgSwitcherTrigger({
  className,
  initial,
  ...props
}: React.ComponentProps<"summary"> & { initial: string }) {
  return (
    <summary
      aria-label="Switch organization"
      data-slot="org-switcher-trigger"
      className={cn(
        "flex size-7 cursor-pointer list-none items-center justify-center rounded-md border-2 border-transparent bg-brand text-[14px] font-semibold text-brand-on select-none hover:border-sidebar-muted-foreground group-open:border-sidebar-foreground [&::-webkit-details-marker]:hidden",
        className,
      )}
      {...props}
    >
      {initial}
    </summary>
  );
}

export { OrgSwitcher, OrgSwitcherTrigger };
