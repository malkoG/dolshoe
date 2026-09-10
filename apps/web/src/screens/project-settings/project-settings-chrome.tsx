import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { OrgSwitcher, OrgSwitcherTrigger } from "@dolshoe/ui/components/org-switcher";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { ProjectSwitcher, ProjectSwitcherTrigger } from "@dolshoe/ui/components/project-switcher";
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

import { ProjectSettings, type ProjectSettingsProps } from "./project-settings";

const PROJECT_NAV = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CircleAlert, label: "Reports" },
  { icon: ScrollText, label: "Logs" },
  { icon: Waypoints, label: "Traces" },
  { icon: Bell, label: "Alerts" },
  { icon: KeyRound, label: "Tokens" },
  { icon: Settings, label: "Settings", active: true },
] as const;

const ORG_NAV = [
  { icon: Boxes, label: "All projects" },
  { icon: Users, label: "Members" },
  { icon: Settings, label: "Settings" },
  { icon: Building2, label: "Organizations" },
] as const;

function NavItem({
  active = false,
  icon: Icon,
  label,
}: Readonly<{ active?: boolean; icon: LucideIcon; label: string }>) {
  return (
    <div
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-[14px] leading-[22px]",
        active
          ? "bg-sidebar-accent font-semibold text-sidebar-foreground"
          : "font-normal text-sidebar-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </div>
  );
}

function ViewerMark({
  initials = "KW",
  sizeClassName,
}: Readonly<{ initials?: string; sizeClassName: string }>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-identity",
        sizeClassName,
      )}
    >
      <span className="font-mono text-[9px] font-medium tracking-[0.6px] text-identity-on uppercase">
        {initials}
      </span>
    </div>
  );
}

/**
 * The Figma project-settings chrome — sidebar, TopBar trail, then the body.
 *
 * @remarks
 * Named-state silhouettes and the construction test mount this. The live
 * route already sits under `PageShell` and must not. Mounting both would
 * photograph a second shell on a page that already has one.
 */
export function ProjectSettingsChrome({
  children,
  orgName = "Acme Payments",
  projectName = "checkout-api",
}: Readonly<{
  children: ReactNode;
  orgName?: string;
  projectName?: string;
}>) {
  return (
    <div className="flex min-h-[720px] w-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <OrgSwitcher>
              <OrgSwitcherTrigger initial={orgName.slice(0, 1)} />
            </OrgSwitcher>
            <p className="min-w-0 truncate text-[12px] font-semibold text-sidebar-foreground">
              {orgName}
            </p>
          </div>
        </div>

        <nav aria-label="Sidebar" className="flex flex-col gap-2 px-2">
          <div className="flex flex-col gap-1">
            <ProjectSwitcher>
              <ProjectSwitcherTrigger initial={projectName.slice(0, 1)} name={projectName} />
            </ProjectSwitcher>
            {PROJECT_NAV.map((item) => (
              <NavItem
                active={"active" in item && item.active}
                icon={item.icon}
                key={`project-${item.label}`}
                label={item.label}
              />
            ))}
          </div>
          <div aria-hidden="true" className="mx-3 h-px bg-sidebar-border" />
          <div className="flex flex-col gap-1">
            {ORG_NAV.map((item) => (
              <NavItem icon={item.icon} key={`org-${item.label}`} label={item.label} />
            ))}
          </div>
        </nav>

        <div className="min-h-0 flex-1" />

        <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
          <ViewerMark sizeClassName="size-8" />
          <div className="min-w-0 flex-1 text-[12px] leading-[18px]">
            <p className="truncate font-semibold text-sidebar-foreground">Koding Warrior</p>
            <p className="truncate font-medium text-sidebar-muted-foreground">@kodingwarrior</p>
          </div>
          <ChevronDown aria-hidden="true" className="size-3.5 text-sidebar-muted-foreground" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TopBar
          actions={
            <>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1">
                <span className="relative size-3.5 shrink-0">
                  <Search aria-hidden="true" className="absolute top-0 left-0 size-4" />
                </span>
                <span className="text-[12px] font-medium text-faint">Search</span>
                <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono text-[12px] text-faint">
                  ⌘K
                </kbd>
              </div>
              <ViewerMark sizeClassName="size-7" />
            </>
          }
          trail={
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
              <Breadcrumb>{orgName}</Breadcrumb>
              <BreadcrumbSeparator />
              <Breadcrumb>{projectName}</Breadcrumb>
              <BreadcrumbSeparator />
              <Breadcrumb current>Settings</Breadcrumb>
            </nav>
          }
        />
        <div className="flex flex-1 flex-col gap-4 px-9 py-13">
          <PageHeading className="mb-0">Settings</PageHeading>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The composition the silhouette photographs: private chrome, then the
 * public settings view. The route renders `ProjectSettings` alone.
 */
export function ProjectSettingsReview(props: ProjectSettingsProps) {
  return (
    <ProjectSettingsChrome>
      <ProjectSettings {...props} />
    </ProjectSettingsChrome>
  );
}
