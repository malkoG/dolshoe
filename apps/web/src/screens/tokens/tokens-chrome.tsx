import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import {
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  ChevronsUpDown,
  CircleAlert,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Search,
  Settings,
  Users,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";

import { initialsOf } from "../../lib/format";

/**
 * Chrome values the Tokens silhouette paints. The live route does not pass
 * these — PageShell already wraps that composition root.
 */
export interface TokensChrome {
  orgName: string;
  projectName: string;
  viewerName: string;
  viewerHandle: string;
}

const PROJECT_LINKS = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CircleAlert, label: "Reports" },
  { icon: ScrollText, label: "Logs" },
  { icon: Waypoints, label: "Traces" },
  { icon: Bell, label: "Alerts" },
  { icon: KeyRound, label: "Tokens", active: true },
  { icon: Settings, label: "Settings" },
] as const;

const ORG_LINKS = [
  { icon: Boxes, label: "All projects" },
  { icon: Users, label: "Members" },
  { icon: Settings, label: "Settings" },
  { icon: Building2, label: "Organizations" },
] as const;

/**
 * A Tokens-only stand-in for the project shell.
 *
 * @remarks
 * Figma 27 paints the sidebar and top bar on every frame. Those pieces are
 * not extracted to `page-shell` here — a second screen that needs the same
 * chrome is the moment to share them. Until then the stubs live next to
 * the view that photographs them.
 */
export function TokensChrome({
  children,
  chrome,
}: Readonly<{ children: ReactNode; chrome: TokensChrome }>) {
  const orgInitial = initialsOf(chrome.orgName).slice(0, 1);
  const projectInitial = initialsOf(chrome.projectName).slice(0, 1);

  return (
    <div className="flex min-h-[1006px] w-[1440px] bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-brand text-sm font-semibold text-brand-foreground">
              {orgInitial}
            </span>
            <span className="truncate text-xs font-semibold">{chrome.orgName}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-2">
          <div className="flex flex-col gap-1">
            <div className="flex h-10 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent py-1.5 pr-3 pl-1.5">
              <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-identity text-xs font-semibold text-identity-foreground">
                {projectInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[9px] tracking-[0.06em] text-sidebar-muted-foreground uppercase">
                  Project
                </span>
                <span className="block truncate text-xs font-semibold">{chrome.projectName}</span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
            </div>

            {PROJECT_LINKS.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </div>

          <div className="bg-sidebar-border h-px w-[100px]" />

          <div className="flex flex-col gap-1">
            {ORG_LINKS.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg bg-identity text-[10px] font-extrabold text-identity-foreground">
              {initialsOf(chrome.viewerName)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 text-xs">
            <strong className="block truncate font-semibold">{chrome.viewerName}</strong>
            <span className="block truncate text-sidebar-muted-foreground">
              {chrome.viewerHandle}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-border bg-card px-7">
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs">
            <span className="rounded-sm px-2 py-1 font-medium text-muted-foreground">
              {chrome.orgName}
            </span>
            <span className="text-faint" aria-hidden="true">
              /
            </span>
            <span className="rounded-sm px-2 py-1 font-medium text-muted-foreground">
              {chrome.projectName}
            </span>
            <span className="text-faint" aria-hidden="true">
              /
            </span>
            <span className="rounded-sm px-2 py-1 font-semibold">Tokens</span>
          </nav>

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1 text-xs text-faint">
            <Search className="size-3.5" />
            <span>Search</span>
            <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono">⌘K</kbd>
          </div>

          <Avatar className="size-7 rounded-lg">
            <AvatarFallback className="rounded-lg bg-identity text-[9px] font-extrabold text-identity-foreground">
              {initialsOf(chrome.viewerName)}
            </AvatarFallback>
          </Avatar>
        </header>

        <div className="px-9 pt-13 pb-[52px]">
          <PageHeading>Tokens</PageHeading>
          {children}
        </div>
      </div>
    </div>
  );
}

function NavItem({
  active = false,
  icon: Icon,
  label,
}: Readonly<{
  active?: boolean;
  icon: typeof KeyRound;
  label: string;
}>) {
  return (
    <div
      className={
        active
          ? "flex items-center gap-2 rounded-sm bg-sidebar-accent px-3 py-2 text-sm font-semibold"
          : "flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-sidebar-muted-foreground"
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{label}</span>
    </div>
  );
}
