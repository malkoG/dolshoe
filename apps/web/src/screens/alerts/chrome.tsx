import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { OrgSwitcher, OrgSwitcherTrigger } from "@dolshoe/ui/components/org-switcher";
import { ProjectSwitcher, ProjectSwitcherTrigger } from "@dolshoe/ui/components/project-switcher";
import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
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
  type LucideIcon,
} from "lucide-react";

/**
 * Chrome copied onto this screen so a silhouette can show the Figma frame
 * without promoting a new page-shell.
 *
 * @remarks
 * Tokens and the switcher/breadcrumb primitives come from `@dolshoe/ui`. The
 * layout itself stays private: the shared `PageShell` is frozen, and this
 * stub is only a photograph of screen 26, not a second navigator.
 */
export interface AlertsChrome {
  orgInitial: string;
  orgName: string;
  projectInitial: string;
  projectName: string;
  viewerHandle: string;
  viewerInitials: string;
  viewerName: string;
}

const PROJECT_LINKS: ReadonlyArray<{ icon: LucideIcon; label: string; current?: boolean }> = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CircleAlert, label: "Reports" },
  { icon: ScrollText, label: "Logs" },
  { icon: Waypoints, label: "Traces" },
  { icon: Bell, label: "Alerts", current: true },
  { icon: KeyRound, label: "Tokens" },
  { icon: Settings, label: "Settings" },
];

const ORG_LINKS: ReadonlyArray<{ icon: LucideIcon; label: string }> = [
  { icon: Boxes, label: "All projects" },
  { icon: Users, label: "Members" },
  { icon: Settings, label: "Settings" },
  { icon: Building2, label: "Organizations" },
];

function NavItem({
  current = false,
  icon: Icon,
  label,
}: Readonly<{ current?: boolean; icon: LucideIcon; label: string }>) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-3 py-2",
        current ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span className={cn("text-sm", current ? "font-semibold" : "font-normal")}>{label}</span>
    </div>
  );
}

export function AlertsSidebar({
  orgInitial,
  orgName,
  projectInitial,
  projectName,
  viewerHandle,
  viewerInitials,
  viewerName,
}: AlertsChrome) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="p-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <OrgSwitcher>
            <OrgSwitcherTrigger initial={orgInitial} />
          </OrgSwitcher>
          <span className="min-w-0 truncate text-xs font-semibold text-sidebar-foreground">
            {orgName}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-2">
        <div className="flex flex-col gap-1">
          <ProjectSwitcher>
            <ProjectSwitcherTrigger initial={projectInitial} name={projectName} />
          </ProjectSwitcher>
          {PROJECT_LINKS.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </div>
        <div className="mx-2 h-px w-[100px] bg-sidebar-border" />
        <div className="flex flex-col gap-1">
          {ORG_LINKS.map((item) => (
            <NavItem key={`org-${item.label}`} {...item} />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1" />

      <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg bg-identity font-mono text-[9px] font-medium tracking-[0.06em] text-identity-foreground uppercase">
            {viewerInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 overflow-hidden text-xs leading-[18px]">
          <p className="truncate font-semibold text-sidebar-foreground">{viewerName}</p>
          <p className="truncate font-medium text-sidebar-muted-foreground">{viewerHandle}</p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-sidebar-muted-foreground"
        />
      </div>
    </aside>
  );
}

export function AlertsTopBar({
  orgName,
  projectName,
  viewerInitials,
}: Pick<AlertsChrome, "orgName" | "projectName" | "viewerInitials">) {
  return (
    <TopBar
      actions={
        <>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1">
            <Search aria-hidden="true" className="size-3.5 text-faint" />
            <span className="text-xs font-medium text-faint">Search</span>
            <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono text-xs text-faint">
              ⌘K
            </kbd>
          </div>
          <Avatar className="size-7 rounded-lg">
            <AvatarFallback className="rounded-lg bg-identity font-mono text-[9px] font-medium tracking-[0.06em] text-identity-foreground uppercase">
              {viewerInitials}
            </AvatarFallback>
          </Avatar>
        </>
      }
      trail={
        <>
          <Breadcrumb>{orgName}</Breadcrumb>
          <BreadcrumbSeparator />
          <Breadcrumb>{projectName}</Breadcrumb>
          <BreadcrumbSeparator />
          <Breadcrumb current>Alerts</Breadcrumb>
        </>
      }
    />
  );
}
