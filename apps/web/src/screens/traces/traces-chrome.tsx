import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { ProjectSwitcher, ProjectSwitcherTrigger } from "@dolshoe/ui/components/project-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@dolshoe/ui/components/ui/avatar";
import { cn } from "@dolshoe/ui/lib/utils";
import {
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  CircleAlert,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Search,
  Settings,
  Users,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { TracesScreen, type TracesScreenProps } from "./traces-screen";

/**
 * Fixture values the silhouette chrome needs — org, project, and viewer.
 *
 * @remarks
 * The live route does not mount this chrome (PageShell already paints it).
 * These labels exist so a named state can photograph Figma 95:2 / 95:435
 * without talking to the API.
 */
export interface TracesChrome {
  orgName: string;
  orgInitial: string;
  projectName: string;
  projectInitial: string;
  viewerName: string;
  viewerHandle: string;
  viewerInitials: string;
  viewerAvatarUrl?: string | null;
}

export const tracesFigmaChrome: TracesChrome = {
  orgName: "Acme Payments",
  orgInitial: "A",
  projectName: "checkout-api",
  projectInitial: "C",
  viewerName: "Koding Warrior",
  viewerHandle: "@kodingwarrior",
  viewerInitials: "KW",
};

export const tracesChromeTrail = [
  tracesFigmaChrome.orgName,
  tracesFigmaChrome.projectName,
  "Traces",
] as const;

function ViewerAvatar({
  avatarUrl,
  className,
  initials,
}: Readonly<{
  avatarUrl?: string | null;
  className?: string;
  initials: string;
}>) {
  return (
    <Avatar className={cn("rounded-lg bg-identity", className)}>
      {avatarUrl != null && <AvatarImage alt="" src={avatarUrl} />}
      <AvatarFallback className="rounded-lg bg-identity font-mono text-badge tracking-[0.06em] text-identity-on uppercase">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function SidebarNavItem({
  active = false,
  icon: Icon,
  label,
}: Readonly<{ active?: boolean; icon: LucideIcon; label: string }>) {
  return (
    <div
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-3 py-2",
        active
          ? "bg-sidebar-accent text-body-strong font-semibold text-sidebar-foreground"
          : "text-body text-sidebar-muted-foreground",
      )}
      data-active={active ? "true" : undefined}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{label}</span>
    </div>
  );
}

/**
 * Private copy of the Figma sidebar for this screen's silhouette.
 *
 * @remarks
 * PageShell is frozen. This stub composes `@dolshoe/ui` switchers and lucide
 * glyphs (16px slot) so the photograph matches frames 95:2 / 95:435 without
 * editing the shared project layout.
 */
export function TracesSidebar({ chrome }: Readonly<{ chrome: TracesChrome }>) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-4 overflow-hidden p-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-body-strong font-semibold text-brand-on"
          >
            {chrome.orgInitial}
          </span>
          <span className="min-w-0 flex-1 truncate text-meta-strong font-semibold text-sidebar-foreground">
            {chrome.orgName}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-hidden px-2">
        <div className="flex flex-col gap-1">
          <ProjectSwitcher>
            <ProjectSwitcherTrigger initial={chrome.projectInitial} name={chrome.projectName} />
          </ProjectSwitcher>
          <nav aria-label="This project">
            <SidebarNavItem icon={LayoutDashboard} label="Overview" />
            <SidebarNavItem icon={CircleAlert} label="Reports" />
            <SidebarNavItem icon={ScrollText} label="Logs" />
            <SidebarNavItem active icon={Waypoints} label="Traces" />
            <SidebarNavItem icon={Bell} label="Alerts" />
            <SidebarNavItem icon={KeyRound} label="Tokens" />
            <SidebarNavItem icon={Settings} label="Settings" />
          </nav>
        </div>

        <div aria-hidden="true" className="h-px w-[100px] bg-sidebar-border" />

        <nav aria-label="Organization">
          <SidebarNavItem icon={Boxes} label="All projects" />
          <SidebarNavItem icon={Users} label="Members" />
          <SidebarNavItem icon={Settings} label="Settings" />
          <SidebarNavItem icon={Building2} label="Organizations" />
        </nav>
      </div>

      <div className="min-h-px flex-1" />

      <div className="flex items-center gap-2 overflow-hidden border-t border-sidebar-border p-3">
        <ViewerAvatar
          avatarUrl={chrome.viewerAvatarUrl}
          className="size-8"
          initials={chrome.viewerInitials}
        />
        <span className="flex min-w-0 flex-1 flex-col overflow-hidden text-meta leading-[18px]">
          <span className="truncate font-semibold text-sidebar-foreground">
            {chrome.viewerName}
          </span>
          <span className="truncate text-sidebar-muted-foreground">{chrome.viewerHandle}</span>
        </span>
        <span className="relative size-3.5 shrink-0 overflow-hidden">
          <ChevronDown
            aria-hidden="true"
            className="absolute top-0 left-0 size-4 text-sidebar-muted-foreground"
          />
        </span>
      </div>
    </aside>
  );
}

function SearchHint() {
  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-md border border-border bg-muted px-2 py-1">
      <span className="relative size-3.5 shrink-0 overflow-hidden">
        <Search aria-hidden="true" className="absolute top-0 left-0 size-4 text-faint" />
      </span>
      <span className="text-meta text-faint">Search</span>
      <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono text-mono text-faint">
        ⌘K
      </kbd>
    </div>
  );
}

/**
 * Private TopBar trail for this screen — plain Breadcrumb text, no router.
 */
export function TracesTopBar({ chrome }: Readonly<{ chrome: TracesChrome }>) {
  return (
    <TopBar
      actions={
        <>
          <SearchHint />
          <ViewerAvatar
            avatarUrl={chrome.viewerAvatarUrl}
            className="size-7"
            initials={chrome.viewerInitials}
          />
        </>
      }
      trail={
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          <Breadcrumb>{chrome.orgName}</Breadcrumb>
          <BreadcrumbSeparator />
          <Breadcrumb>{chrome.projectName}</Breadcrumb>
          <BreadcrumbSeparator />
          <Breadcrumb current>Traces</Breadcrumb>
        </nav>
      }
    />
  );
}

/**
 * Sidebar + TopBar + body for the named-state photograph, not the live route.
 *
 * @remarks
 * The Figma frames are 1440 × 960. Wrapping the body in this chrome on the
 * traces route would nest a second shell under PageShell.
 */
export function TracesReviewChrome({
  children,
  chrome = tracesFigmaChrome,
}: Readonly<{ children: ReactNode; chrome?: TracesChrome }>) {
  return (
    <div className="flex h-[960px] w-[1440px] overflow-hidden bg-background">
      <TracesSidebar chrome={chrome} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TracesTopBar chrome={chrome} />
        <main className="min-h-0 flex-1 overflow-auto px-9 pt-[52px] pb-[52px]">{children}</main>
      </div>
    </div>
  );
}

/**
 * The composition the construction test and the silhouette harness share.
 */
export function TracesReviewSurface(props: TracesScreenProps) {
  return (
    <TracesReviewChrome>
      <TracesScreen {...props} />
    </TracesReviewChrome>
  );
}
