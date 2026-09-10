import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { OrgSwitcher, OrgSwitcherTrigger } from "@dolshoe/ui/components/org-switcher";
import { ProjectSwitcher, ProjectSwitcherTrigger } from "@dolshoe/ui/components/project-switcher";
import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
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

import { initialsOf } from "../../lib/format";

/**
 * Chrome copied from Figma frame 93:2 for this screen only.
 *
 * @remarks
 * PageShell still owns the live app's sidebar and top bar. Updating that
 * shared shell is a later, separate cut — these stubs exist so a silhouette
 * can photograph the designed page without pulling layout out of page-shell
 * or `@dolshoe/ui`.
 */
export interface ReportDetailChrome {
  orgName: string;
  orgInitial: string;
  projectName: string;
  projectInitial: string;
  viewerName: string;
  viewerHandle: string;
  trail: ReadonlyArray<{ label: string; current?: boolean }>;
}

const PROJECT_NAV: ReadonlyArray<{ icon: LucideIcon; label: string; active?: boolean }> = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CircleAlert, label: "Reports", active: true },
  { icon: ScrollText, label: "Logs" },
  { icon: Waypoints, label: "Traces" },
  { icon: Bell, label: "Alerts" },
  { icon: KeyRound, label: "Tokens" },
  { icon: Settings, label: "Settings" },
];

const ORG_NAV: ReadonlyArray<{ icon: LucideIcon; label: string }> = [
  { icon: Boxes, label: "All projects" },
  { icon: Users, label: "Members" },
  { icon: Settings, label: "Settings" },
  { icon: Building2, label: "Organizations" },
];

function NavItem({
  active = false,
  icon: Icon,
  label,
}: Readonly<{ active?: boolean; icon: LucideIcon; label: string }>) {
  return (
    <span
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "flex w-full items-center gap-2 rounded-sm bg-sidebar-accent px-3 py-2 text-[14px] font-semibold text-sidebar-foreground"
          : "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-[14px] font-normal text-sidebar-muted-foreground"
      }
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </span>
  );
}

function ReportDetailSidebar({ chrome }: Readonly<{ chrome: ReportDetailChrome }>) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-4 overflow-hidden p-4">
        <OrgSwitcher className="flex w-32 items-center gap-2 overflow-hidden">
          <OrgSwitcherTrigger initial={chrome.orgInitial} />
          <span className="min-w-0 truncate text-[12px] font-semibold text-sidebar-foreground">
            {chrome.orgName}
          </span>
        </OrgSwitcher>
      </div>

      <div className="flex flex-col gap-2 px-2">
        <div className="flex flex-col gap-1">
          <ProjectSwitcher>
            <ProjectSwitcherTrigger initial={chrome.projectInitial} name={chrome.projectName} />
          </ProjectSwitcher>
          {PROJECT_NAV.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </div>

        <div aria-hidden="true" className="h-px w-[100px] bg-sidebar-border" />

        <div className="flex flex-col gap-1">
          {ORG_NAV.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1" />

      <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg bg-identity font-mono text-[9px] font-extrabold tracking-[0.06em] text-identity-foreground uppercase">
            {initialsOf(chrome.viewerName)}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col overflow-hidden text-[12px] leading-[18px]">
          <strong className="truncate font-semibold text-sidebar-foreground">
            {chrome.viewerName}
          </strong>
          <span className="truncate font-medium text-sidebar-muted-foreground">
            {chrome.viewerHandle}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-sidebar-muted-foreground"
        />
      </div>
    </aside>
  );
}

function ReportDetailTopBar({ chrome }: Readonly<{ chrome: ReportDetailChrome }>) {
  return (
    <TopBar
      actions={
        <>
          <div
            aria-hidden="true"
            className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1"
          >
            <Search className="size-3.5 text-faint" />
            <span className="text-[12px] font-medium text-faint">Search</span>
            <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono text-[12px] text-faint">
              ⌘K
            </kbd>
          </div>
          <Avatar className="size-7 rounded-lg">
            <AvatarFallback className="rounded-lg bg-identity font-mono text-[9px] font-extrabold tracking-[0.06em] text-identity-foreground uppercase">
              {initialsOf(chrome.viewerName)}
            </AvatarFallback>
          </Avatar>
        </>
      }
      trail={
        <nav aria-label="Breadcrumb">
          {chrome.trail.map((step, index) => (
            <span className="contents" key={`${step.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator />}
              <Breadcrumb current={step.current === true}>{step.label}</Breadcrumb>
            </span>
          ))}
        </nav>
      }
    />
  );
}

export function ReportDetailFrame({
  chrome,
  children,
}: Readonly<{ chrome: ReportDetailChrome; children: ReactNode }>) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <ReportDetailSidebar chrome={chrome} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ReportDetailTopBar chrome={chrome} />
        <div className="w-full flex-1 px-9 py-13">{children}</div>
      </div>
    </div>
  );
}
