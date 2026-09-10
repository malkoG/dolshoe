import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { OrgSwitcher, OrgSwitcherTrigger } from "@dolshoe/ui/components/org-switcher";
import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
import { cn } from "@dolshoe/ui/lib/utils";
import { Boxes, Building2, ChevronDown, Search, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { OrgSettings, type OrgSettingsProps } from "./org-settings";

/**
 * Fixture values the silhouette chrome needs — org and viewer.
 *
 * @remarks
 * The live route does not mount this chrome (PageShell already paints it).
 * These labels exist so a named state can photograph Figma 90:2 / 90:166
 * without talking to the API.
 */
export interface OrgSettingsChromeFixture {
  orgInitial: string;
  orgName: string;
  viewerHandle: string;
  viewerInitials: string;
  viewerName: string;
}

export const orgSettingsFigmaChrome: OrgSettingsChromeFixture = {
  orgInitial: "A",
  orgName: "Acme Payments",
  viewerHandle: "@kodingwarrior",
  viewerInitials: "KW",
  viewerName: "Koding Warrior",
};

export const FIGMA_ORG_SETTINGS_TRAIL = [
  { label: orgSettingsFigmaChrome.orgName },
  { label: "Settings" },
] as const;

export type OrgSettingsTrailCrumb = {
  label: string;
};

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
 * PageShell is frozen. This stub composes `@dolshoe/ui` OrgSwitcher and
 * lucide glyphs so the photograph matches frames 90:2 / 90:166 without
 * editing the shared layout. Org settings is org-scoped — Figma has no
 * This-project group here.
 */
export function OrgSettingsSidebar({ chrome }: Readonly<{ chrome: OrgSettingsChromeFixture }>) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-4 overflow-hidden p-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <OrgSwitcher>
            <OrgSwitcherTrigger initial={chrome.orgInitial} />
          </OrgSwitcher>
          <span className="min-w-0 flex-1 truncate text-meta-strong font-semibold text-sidebar-foreground">
            {chrome.orgName}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-hidden px-2">
        <nav aria-label="Organization">
          <SidebarNavItem icon={Boxes} label="All projects" />
          <SidebarNavItem icon={Users} label="Members" />
          <SidebarNavItem active icon={Settings} label="Settings" />
          <SidebarNavItem icon={Building2} label="Organizations" />
        </nav>
      </div>

      <div className="min-h-px flex-1" />

      <div className="flex items-center gap-2 overflow-hidden border-t border-sidebar-border p-3">
        <Avatar className="size-8 rounded-lg bg-identity">
          <AvatarFallback className="rounded-lg bg-identity font-mono text-badge tracking-[0.06em] text-identity-on uppercase">
            {chrome.viewerInitials}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col overflow-hidden text-meta leading-[18px]">
          <span className="truncate font-semibold text-sidebar-foreground">
            {chrome.viewerName}
          </span>
          <span className="truncate text-sidebar-muted-foreground">{chrome.viewerHandle}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-sidebar-muted-foreground"
        />
      </div>
    </aside>
  );
}

/**
 * Private TopBar trail for this screen — plain Breadcrumb text, no router.
 */
export function OrgSettingsTopBar({
  chrome,
  trail,
}: Readonly<{ chrome: OrgSettingsChromeFixture; trail: readonly OrgSettingsTrailCrumb[] }>) {
  const last = trail.length - 1;

  return (
    <TopBar
      actions={
        <>
          <div className="flex items-center gap-2 overflow-hidden rounded-md border border-border bg-muted px-2 py-1">
            <span className="relative size-3.5 shrink-0">
              <Search aria-hidden="true" className="absolute top-0 left-0 size-4" />
            </span>
            <span className="text-meta text-faint">Search</span>
            <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono text-mono text-faint">
              ⌘K
            </kbd>
          </div>
          <Avatar className="size-7 rounded-lg bg-identity">
            <AvatarFallback className="rounded-lg bg-identity font-mono text-badge tracking-[0.06em] text-identity-on uppercase">
              {chrome.viewerInitials}
            </AvatarFallback>
          </Avatar>
        </>
      }
      trail={
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          {trail.map((crumb, index) => (
            <span className="flex items-center gap-1" key={`${crumb.label}:${index}`}>
              {index > 0 && <BreadcrumbSeparator />}
              <Breadcrumb current={index === last}>{crumb.label}</Breadcrumb>
            </span>
          ))}
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
 * settings route would nest a second shell under PageShell.
 */
export function OrgSettingsChrome({
  children,
  chrome = orgSettingsFigmaChrome,
  trail = FIGMA_ORG_SETTINGS_TRAIL,
}: Readonly<{
  children: ReactNode;
  chrome?: OrgSettingsChromeFixture;
  trail?: readonly OrgSettingsTrailCrumb[];
}>) {
  return (
    <div className="flex h-[960px] w-[1440px] overflow-hidden bg-background">
      <OrgSettingsSidebar chrome={chrome} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OrgSettingsTopBar chrome={chrome} trail={trail} />
        <main className="min-h-0 flex-1 overflow-auto px-9 pt-[52px] pb-[52px]">{children}</main>
      </div>
    </div>
  );
}

/**
 * The composition the construction test and the silhouette harness share.
 */
export function OrgSettingsReview(props: OrgSettingsProps) {
  return (
    <OrgSettingsChrome>
      <OrgSettings {...props} />
    </OrgSettingsChrome>
  );
}
