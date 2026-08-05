import { Avatar, AvatarFallback, AvatarImage } from "@dolshoe/ui/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
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
  SidebarTrigger,
} from "@dolshoe/ui/components/ui/sidebar";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  Building2,
  ChevronsUpDown,
  CircleAlert,
  KeyRound,
  LogOut,
  ScrollText,
  Users,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";

import { initialsOf } from "../lib/format";
import type { Organization } from "../lib/organizations";
import type { Project } from "../lib/projects";
import type { Viewer } from "../lib/session";
import { useSignOut } from "../lib/use-sign-out";

/** Marks the link TanStack Router considers current, for the menu button's own styling. */
const ACTIVE_LINK_PROPS = { "data-active": "true" } as const;

/**
 * The chrome every page shares.
 *
 * @remarks
 * Navigation narrows from the outside in: the organization switcher picks a
 * tenant, the project switcher picks one of its projects, and the section links
 * below stay in view while you move between that project's reports, logs, and
 * tokens. `projects` is what the caller managed to load — an empty list simply
 * leaves the switcher out rather than blocking the page behind it.
 */
export function PageShell({
  activeProjectId,
  children,
  organizations = [],
  orgSlug,
  projects = [],
  viewer,
}: Readonly<{
  activeProjectId?: string;
  children: ReactNode;
  organizations?: Organization[];
  orgSlug: string;
  projects?: Project[];
  viewer?: Viewer;
}>) {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const inProject = projects.some((project) => project.id === activeProjectId);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="gap-4 p-4">
          <Link
            className="flex w-fit items-center gap-2.5 px-1 text-lg font-extrabold tracking-[-0.03em]"
            params={{ orgSlug }}
            to="/orgs/$orgSlug/projects"
            aria-label="Dolshoe home"
          >
            <img className="size-7" src="/dolshoe-mark-reversed.svg" alt="" />
            <span>dolshoe</span>
          </Link>

          <div className="flex flex-col gap-2">
            {/*
              Left out entirely for someone who only belongs to one organization:
              a switcher with a single option is a control that cannot do
              anything.
            */}
            {organizations.length > 1 && (
              <Select
                onValueChange={(value) =>
                  void navigate({ to: "/orgs/$orgSlug/projects", params: { orgSlug: value } })
                }
                value={orgSlug}
              >
                <SelectTrigger aria-label="Switch organization" className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.slug}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/*
              Only rendered when the active project is actually one of the options.
              A select whose value matches nothing falls back to displaying the
              first option, which would name a project the page is not showing.
            */}
            {inProject && activeProjectId != null && (
              <Select
                onValueChange={(value) =>
                  void navigate({
                    to: "/orgs/$orgSlug/projects/$projectId/reports",
                    params: { orgSlug, projectId: value },
                  })
                }
                value={activeProjectId}
              >
                <SelectTrigger aria-label="Switch project" className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2">
          {inProject && activeProjectId != null && (
            <>
              <SidebarGroup className="py-0">
                <SidebarGroupLabel className="font-mono text-[9px] tracking-[0.09em] uppercase">
                  This project
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          activeProps={ACTIVE_LINK_PROPS}
                          params={{ orgSlug, projectId: activeProjectId }}
                          to="/orgs/$orgSlug/projects/$projectId/reports"
                        >
                          <CircleAlert />
                          <span>Reports</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          activeProps={ACTIVE_LINK_PROPS}
                          params={{ orgSlug, projectId: activeProjectId }}
                          to="/orgs/$orgSlug/projects/$projectId/logs"
                        >
                          <ScrollText />
                          <span>Logs</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          activeProps={ACTIVE_LINK_PROPS}
                          params={{ orgSlug, projectId: activeProjectId }}
                          to="/orgs/$orgSlug/projects/$projectId/traces"
                        >
                          <Waypoints />
                          <span>Traces</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <Link
                          activeProps={ACTIVE_LINK_PROPS}
                          params={{ orgSlug, projectId: activeProjectId }}
                          to="/orgs/$orgSlug/projects/$projectId/tokens"
                        >
                          <KeyRound />
                          <span>Tokens</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarSeparator className="mx-2" />
            </>
          )}

          <SidebarGroup className="py-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link
                      activeOptions={{ exact: true }}
                      activeProps={ACTIVE_LINK_PROPS}
                      params={{ orgSlug }}
                      to="/orgs/$orgSlug/projects"
                    >
                      <Boxes />
                      <span>All projects</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link
                      activeOptions={{ exact: true }}
                      activeProps={ACTIVE_LINK_PROPS}
                      params={{ orgSlug }}
                      to="/orgs/$orgSlug/members"
                    >
                      <Users />
                      <span>Members</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link
                      activeOptions={{ exact: true }}
                      activeProps={ACTIVE_LINK_PROPS}
                      to="/orgs"
                    >
                      <Building2 />
                      <span>Organizations</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          {/*
            A <details> rather than a popover library: it gives keyboard access
            and dismissal for free, and this menu holds two things. Radix is
            available now, but nothing here needs what it would add.

            It used to share this bar with a command-menu button and a
            notification bell wearing a permanent unread dot, neither of which
            was wired to anything. A control that cannot do what it says is
            worse than a missing one: the dot in particular asked to be cleared
            every time somebody looked at it, forever.
          */}
          {viewer != null && (
            <details className="group relative">
              <summary
                className="flex w-full cursor-pointer list-none items-center gap-2.5 rounded-md p-2 hover:bg-sidebar-accent [&::-webkit-details-marker]:hidden"
                aria-label="Open account menu"
              >
                <Avatar className="size-8 rounded-lg">
                  {/*
                    Decorative: the summary already carries the accessible name,
                    and the label would otherwise be announced twice.
                  */}
                  {viewer.avatarUrl != null && <AvatarImage src={viewer.avatarUrl} alt="" />}
                  <AvatarFallback className="rounded-lg bg-identity text-[10px] font-extrabold text-identity-foreground">
                    {initialsOf(viewer.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <strong className="truncate text-[13px] font-bold">{viewer.name}</strong>
                  <span className="truncate text-[11px] text-sidebar-muted-foreground">
                    {viewer.githubLogin == null ? viewer.email : `@${viewer.githubLogin}`}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
              </summary>

              <div className="absolute right-0 bottom-14 left-0 z-30 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-panel">
                <Link
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium hover:bg-accent"
                  to="/orgs"
                >
                  <Building2 className="size-3.5" />
                  Organizations
                </Link>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium hover:bg-accent"
                  onClick={() => void signOut()}
                  type="button"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </div>
            </details>
          )}
        </SidebarFooter>
      </Sidebar>

      {/*
        Transparent rather than the primitive's own solid fill, so the page's
        graph-paper backdrop reads through the workspace the way it always has.
      */}
      <SidebarInset className="bg-transparent">
        {/*
          The only way back to the navigation once it has slid off-canvas, so it
          appears exactly where the navigation does not.
        */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-bold">dolshoe</span>
        </div>

        <div className="mx-auto w-full max-w-[1230px] px-5 py-10 md:px-9 md:py-13">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
