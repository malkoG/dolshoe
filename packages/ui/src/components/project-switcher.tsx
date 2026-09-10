import { ChevronsUpDownIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/utils";

/**
 * The `<details>` wrapping a project switcher pill, opened the same way as
 * `OrgSwitcher` — a details/summary disclosure, no popover library.
 */
function ProjectSwitcher({ className, ...props }: React.ComponentProps<"details">) {
  return (
    <details data-slot="project-switcher" className={cn("group relative", className)} {...props} />
  );
}

/**
 * Heads the sidebar's "This project" group — replaces a plain `SelectTrigger`
 * there, which read as too weak a control for something this central.
 *
 * @remarks
 * The identity-coloured mark is a stand-in until projects carry their own
 * colour; `initial` is the caller's choice of which character represents one.
 */
function ProjectSwitcherTrigger({
  className,
  initial,
  name,
  ...props
}: React.ComponentProps<"summary"> & { initial: string; name: string }) {
  return (
    <summary
      aria-label="Switch project"
      data-slot="project-switcher-trigger"
      className={cn(
        "flex h-10 w-full cursor-pointer list-none items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent py-1.5 pr-3 pl-1.5 select-none hover:border-sidebar-muted-foreground hover:shadow-[0_4px_6px_rgba(0,0,0,0.35)] [&::-webkit-details-marker]:hidden",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-identity text-[12px] font-semibold text-identity-foreground"
      >
        {initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start overflow-hidden">
        <span className="font-mono text-[9px] font-medium tracking-[0.06em] text-sidebar-muted-foreground uppercase">
          Project
        </span>
        <span className="w-full truncate text-[12px] font-semibold text-sidebar-foreground">
          {name}
        </span>
      </span>
      <ChevronsUpDownIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
    </summary>
  );
}

export { ProjectSwitcher, ProjectSwitcherTrigger };
