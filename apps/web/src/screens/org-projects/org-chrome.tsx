import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { OrgSwitcher, OrgSwitcherTrigger } from "@dolshoe/ui/components/org-switcher";
import {
  SwitcherMenu,
  SwitcherMenuActions,
  SwitcherMenuDivider,
  SwitcherMenuItemBadge,
  SwitcherMenuItemCheck,
  SwitcherMenuItemLabel,
  SwitcherMenuItemMark,
  SwitcherMenuLabel,
  SwitcherMenuList,
  switcherMenuActionVariants,
  switcherMenuItemVariants,
} from "@dolshoe/ui/components/switcher-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@dolshoe/ui/components/ui/avatar";
import { cn } from "@dolshoe/ui/lib/utils";
import { Boxes, Building2, ChevronDown, LogOut, Search, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";

import {
  OrgProjects,
  type OrgMarkTone,
  type OrgProjectsHrefs,
  type OrgProjectsOrganization,
  type OrgProjectsProps,
  type OrgProjectsViewer,
} from "./org-projects";

/**
 * Private org chrome for the projects screen.
 *
 * @remarks
 * Named-state silhouettes and the construction test mount this. The live
 * route already sits under `PageShell` and must not. Mounting both would
 * photograph a second shell on a page that already has one.
 */

const MARK_TONE_CLASS: Record<OrgMarkTone, string> = {
  brand: "bg-brand text-brand-on",
  info: "bg-info text-brand-on",
  identity: "bg-identity text-identity-on",
  violet: "bg-violet text-brand-on",
  success: "bg-success text-brand-on",
};

const NAV_ITEMS = [
  { href: "projects", icon: Boxes, label: "All projects" },
  { href: "members", icon: Users, label: "Members" },
  { href: "settings", icon: Settings, label: "Settings" },
  { href: "organizations", icon: Building2, label: "Organizations" },
] as const;

export function OrgChrome({
  children,
  frame = "page",
  hrefs,
  onSignOut,
  organization,
  organizations,
  orgMenuOpen,
  viewer,
}: Readonly<{
  children: ReactNode;
  frame?: "page" | "1440" | "1024";
  hrefs: OrgProjectsHrefs;
  onSignOut?: () => void;
  organization: OrgProjectsOrganization;
  organizations: OrgProjectsOrganization[];
  orgMenuOpen?: boolean;
  viewer: OrgProjectsViewer;
}>) {
  return (
    <div
      className={cn(
        "flex bg-background",
        frame === "page" ? "min-h-svh w-full" : "h-[960px] shrink-0 overflow-hidden",
        frame === "1440" && "w-[1440px]",
        frame === "1024" && "w-[1024px]",
      )}
    >
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <OrgSwitcher open={orgMenuOpen}>
              <OrgSwitcherTrigger initial={organization.initial} />
              <SwitcherMenu>
                <SwitcherMenuLabel>Switch organization</SwitcherMenuLabel>
                <SwitcherMenuList>
                  {organizations.map((candidate) => {
                    const current = candidate.slug === organization.slug;
                    return (
                      <a
                        aria-current={current ? "page" : undefined}
                        className={switcherMenuItemVariants({ current })}
                        href={candidate.href}
                        key={candidate.slug}
                      >
                        <SwitcherMenuItemMark className={MARK_TONE_CLASS[candidate.markTone]}>
                          {candidate.initial}
                        </SwitcherMenuItemMark>
                        <SwitcherMenuItemLabel>{candidate.name}</SwitcherMenuItemLabel>
                        <SwitcherMenuItemBadge>{candidate.role}</SwitcherMenuItemBadge>
                        {current ? <SwitcherMenuItemCheck /> : null}
                      </a>
                    );
                  })}
                </SwitcherMenuList>
                <SwitcherMenuDivider />
                <SwitcherMenuActions>
                  <a className={switcherMenuActionVariants()} href={hrefs.organizations}>
                    <Boxes />
                    All organizations
                  </a>
                  <a className={switcherMenuActionVariants()} href={hrefs.settings}>
                    <Settings />
                    Settings
                  </a>
                </SwitcherMenuActions>
              </SwitcherMenu>
            </OrgSwitcher>
            <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-sidebar-foreground">
              {organization.name}
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-2 px-2">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "projects";
              return (
                <a
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-[14px]",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-foreground"
                      : "font-normal text-sidebar-muted-foreground hover:bg-sidebar-accent/60",
                  )}
                  href={hrefs[item.href]}
                  key={item.href}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </a>
              );
            })}
          </div>
        </nav>

        <div className="min-h-px flex-1" />

        <div className="border-t border-sidebar-border p-3">
          <details className="group relative">
            <summary
              aria-label="Open account menu"
              className="flex w-full cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
            >
              <ViewerAvatar size="sidebar" viewer={viewer} />
              <span className="flex min-w-0 flex-1 flex-col items-start leading-[18px]">
                <strong className="truncate text-[12px] font-semibold text-sidebar-foreground">
                  {viewer.name}
                </strong>
                <span className="truncate text-[12px] font-medium text-sidebar-muted-foreground">
                  {viewer.handle}
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
            </summary>
            <div className="absolute right-0 bottom-14 left-0 z-30 overflow-hidden rounded-lg border border-border bg-card p-1 text-card-foreground shadow-panel">
              <a
                className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium hover:bg-accent"
                href={hrefs.organizations}
              >
                <Building2 className="size-3.5" />
                Organizations
              </a>
              {onSignOut != null && (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium hover:bg-accent"
                  onClick={onSignOut}
                  type="button"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              )}
            </div>
          </details>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          actions={
            <>
              <SearchHint />
              <ViewerAvatar size="topbar" viewer={viewer} />
            </>
          }
          trail={
            <>
              <Breadcrumb asChild>
                <a href={hrefs.projects}>{organization.name}</a>
              </Breadcrumb>
              <BreadcrumbSeparator />
              <Breadcrumb current>Projects</Breadcrumb>
            </>
          }
        />
        <div className="flex flex-1 flex-col overflow-auto px-9 pt-13 pb-13">{children}</div>
      </div>
    </div>
  );
}

function ViewerAvatar({
  size,
  viewer,
}: Readonly<{ size: "sidebar" | "topbar"; viewer: OrgProjectsViewer }>) {
  return (
    <Avatar className={cn("rounded-lg", size === "sidebar" ? "size-8" : "size-7")}>
      {viewer.avatarUrl != null && <AvatarImage alt="" src={viewer.avatarUrl} />}
      <AvatarFallback className="rounded-lg bg-identity font-mono text-[9px] font-medium tracking-[0.06em] text-identity-on uppercase">
        {viewer.initials}
      </AvatarFallback>
    </Avatar>
  );
}

function SearchHint() {
  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-md border border-border bg-muted px-2 py-1">
      <Search className="size-3.5 text-faint" />
      <span className="text-[12px] font-medium text-faint">Search</span>
      <kbd className="rounded-xs border border-border bg-card px-1 font-mono text-[12px] text-faint">
        ⌘K
      </kbd>
    </div>
  );
}

/**
 * The composition the silhouette photographs: private chrome, then the
 * public projects view. The route renders `OrgProjects` alone.
 */
export function OrgProjectsReview({
  create,
  density,
  frame,
  hrefs,
  list,
  onSignOut,
  organization,
  organizations,
  orgMenuOpen,
  viewer,
}: OrgProjectsProps) {
  return (
    <OrgChrome
      frame={frame}
      hrefs={hrefs}
      onSignOut={onSignOut}
      organization={organization}
      organizations={organizations}
      orgMenuOpen={orgMenuOpen}
      viewer={viewer}
    >
      <OrgProjects create={create} density={density} list={list} />
    </OrgChrome>
  );
}
