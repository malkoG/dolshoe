import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { OrgSwitcher, OrgSwitcherTrigger } from "@dolshoe/ui/components/org-switcher";
import { ProjectSwitcher, ProjectSwitcherTrigger } from "@dolshoe/ui/components/project-switcher";
import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@dolshoe/ui/components/ui/sidebar";
import {
  Bell,
  Boxes,
  Building2,
  ChevronsUpDown,
  CircleAlert,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
  Waypoints,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { LogsScreen, type LogsScreenProps } from "./logs-screen";

/**
 * The trail Figma framed on both Logs screens — org / project / current page.
 * Photographed here; the live route reads the same labels from PageShell.
 */
export const FIGMA_LOGS_TRAIL = [
  { label: "Acme Payments" },
  { label: "checkout-api" },
  { label: "Logs" },
] as const;

export type LogsTrailCrumb = {
  label: string;
};

const PROJECT_NAV = [
  { current: false, icon: LayoutDashboard, label: "Overview" },
  { current: false, icon: CircleAlert, label: "Reports" },
  { current: true, icon: ScrollText, label: "Logs" },
  { current: false, icon: Waypoints, label: "Traces" },
  { current: false, icon: Bell, label: "Alerts" },
  { current: false, icon: KeyRound, label: "Tokens" },
  { current: false, icon: Settings, label: "Settings" },
] as const;

const ORG_NAV = [
  { icon: Boxes, label: "All projects" },
  { icon: Users, label: "Members" },
  { icon: Settings, label: "Settings" },
  { icon: Building2, label: "Organizations" },
] as const;

/**
 * Private app chrome for Logs silhouettes: Sidebar + TopBar + body.
 *
 * @remarks
 * PageShell already paints this live. The shadcn `Sidebar` rail is `fixed` to
 * the viewport, which would escape the review card — so this stub lays the
 * same tokens out in a relative row. The live route must not render it.
 */
export function LogsChrome({
  children,
  trail,
}: Readonly<{ children: ReactNode; trail: readonly LogsTrailCrumb[] }>) {
  const last = trail.length - 1;

  return (
    <SidebarProvider className="min-h-[720px]">
      <div className="flex min-h-[720px] w-full">
        <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-2.5 px-1">
              <OrgSwitcher>
                <OrgSwitcherTrigger initial="A" />
              </OrgSwitcher>
              <span className="truncate text-[13px] font-bold">Acme Payments</span>
            </div>
            <ProjectSwitcher>
              <ProjectSwitcherTrigger initial="C" name="checkout-api" />
            </ProjectSwitcher>
          </div>

          <SidebarContent className="px-2">
            <nav aria-label="Sidebar">
              <SidebarGroup className="py-0">
                <SidebarGroupContent>
                  <SidebarMenu>
                    {PROJECT_NAV.map((item) => (
                      <SidebarMenuItem key={`project:${item.label}`}>
                        <SidebarMenuButton
                          aria-current={item.current ? "page" : undefined}
                          isActive={item.current}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarSeparator className="mx-2" />

              <SidebarGroup className="py-0">
                <SidebarGroupContent>
                  <SidebarMenu>
                    {ORG_NAV.map((item) => (
                      <SidebarMenuItem key={`org:${item.label}`}>
                        <SidebarMenuButton>
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </nav>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2.5 rounded-md p-2">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-identity text-[10px] font-extrabold text-identity-foreground">
                  KW
                </AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <strong className="truncate text-[13px] font-bold">Koding Warrior</strong>
                <span className="truncate text-[11px] text-sidebar-muted-foreground">
                  @kodingwarrior
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
            </div>
          </SidebarFooter>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <TopBar
            trail={
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
                {trail.map((crumb, index) => (
                  <Fragment key={`${crumb.label}:${index}`}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <Breadcrumb current={index === last}>{crumb.label}</Breadcrumb>
                  </Fragment>
                ))}
              </nav>
            }
          />
          <div className="flex flex-col gap-4 px-9 py-8">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}

/**
 * The composition root a construction test and a silhouette share: chrome
 * around the public view. The live route renders `LogsScreen` alone.
 */
export function LogsReviewView(props: LogsScreenProps) {
  return (
    <LogsChrome trail={FIGMA_LOGS_TRAIL}>
      <LogsScreen {...props} />
    </LogsChrome>
  );
}
