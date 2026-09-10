import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@dolshoe/ui/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
import {
  Bell,
  Boxes,
  Building2,
  CircleAlert,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";

import { InvestigationTrail } from "./investigation-trail";
import type { InvestigationCrumb } from "./types";

const PROJECT_LINKS = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Reports", icon: CircleAlert },
  { label: "Logs", icon: ScrollText },
  { label: "Traces", icon: Waypoints, current: true },
  { label: "Alerts", icon: Bell },
  { label: "Tokens", icon: KeyRound },
  { label: "Settings", icon: Settings },
] as const;

const ORG_LINKS = [
  { label: "All projects", icon: Boxes },
  { label: "Members", icon: Users },
  { label: "Settings", icon: Settings },
  { label: "Organizations", icon: Building2 },
] as const;

/**
 * Sidebar + TopBar + padded body — the Figma page chrome, photographed only.
 *
 * @remarks
 * Named states pass a trail so a silhouette can show the full layout. The
 * live route omits the trail; PageShell already owns this chrome. Items are
 * spans, not router links — the harness is not a router.
 */
export function InvestigationChrome({
  children,
  trail,
}: Readonly<{ children: ReactNode; trail: readonly InvestigationCrumb[] }>) {
  const projectLabel = trail[1]?.label ?? trail[0]?.label ?? "checkout-api";

  return (
    <SidebarProvider className="min-h-screen">
      <Sidebar aria-label="Sidebar" collapsible="none" role="navigation">
        <SidebarHeader className="gap-3 p-4">
          <SidebarGroupLabel className="px-1 font-mono text-[9px] tracking-[0.09em] uppercase">
            Project
          </SidebarGroupLabel>
          <p className="truncate px-1 text-sm font-semibold">{projectLabel}</p>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <SidebarGroup className="py-0">
            <SidebarGroupLabel className="font-mono text-[9px] tracking-[0.09em] uppercase">
              This project
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {PROJECT_LINKS.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton isActive={"current" in item && item.current}>
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
                {ORG_LINKS.map((item) => (
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
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-transparent">
        <InvestigationTrail crumbs={trail} />
        <div className="mx-auto w-full max-w-[1230px] px-5 py-10 md:px-9 md:py-13">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
