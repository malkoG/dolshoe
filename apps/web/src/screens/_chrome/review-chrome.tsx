import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { OrgSwitcher, OrgSwitcherTrigger } from "@dolshoe/ui/components/org-switcher";
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
  LogOut,
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
 * Sidebar + TopBar for a silhouette. Live routes stay body-only under
 * PageShell and must not mount this — wrapping both would nest a second shell.
 */

export type ProjectSection =
  | "Overview"
  | "Reports"
  | "Logs"
  | "Traces"
  | "Alerts"
  | "Tokens"
  | "Settings";

export type OrgSection = "All projects" | "Members" | "Settings" | "Organizations";

export type ReviewChromeScope = "project" | "org";

export type ReviewChromeFrame =
  | "board"
  | "page"
  | "alerts"
  | "tokens"
  | "org-page"
  | "org-1440"
  | "org-1024";

export interface ReviewChromeLabels {
  orgName: string;
  orgInitial: string;
  projectName: string;
  projectInitial: string;
  viewerName: string;
  viewerHandle: string;
  viewerInitials: string;
  viewerAvatarUrl?: string | null;
}

export interface ReviewChromeCrumb {
  href?: string;
  label: string;
  current?: boolean;
}

export interface ReviewOrgHrefs {
  members: string;
  organizations: string;
  projects: string;
  settings: string;
}

export interface ReviewAccountMenu {
  organizationsHref: string;
  onSignOut?: () => void;
}

export const FIGMA_REVIEW_CHROME: ReviewChromeLabels = {
  orgName: "Acme Payments",
  orgInitial: "A",
  projectName: "checkout-api",
  projectInitial: "C",
  viewerName: "Koding Warrior",
  viewerHandle: "@kodingwarrior",
  viewerInitials: "KW",
};

const PROJECT_NAV: ReadonlyArray<{ icon: LucideIcon; label: ProjectSection }> = [
  { icon: LayoutDashboard, label: "Overview" },
  { icon: CircleAlert, label: "Reports" },
  { icon: ScrollText, label: "Logs" },
  { icon: Waypoints, label: "Traces" },
  { icon: Bell, label: "Alerts" },
  { icon: KeyRound, label: "Tokens" },
  { icon: Settings, label: "Settings" },
];

const ORG_NAV: ReadonlyArray<{ href: keyof ReviewOrgHrefs; icon: LucideIcon; label: OrgSection }> =
  [
    { href: "projects", icon: Boxes, label: "All projects" },
    { href: "members", icon: Users, label: "Members" },
    { href: "settings", icon: Settings, label: "Settings" },
    { href: "organizations", icon: Building2, label: "Organizations" },
  ];

const FRAME_CLASS: Record<ReviewChromeFrame, string> = {
  board: "flex h-[960px] w-[1440px] overflow-hidden bg-background",
  page: "flex min-h-screen w-full bg-background",
  alerts: "flex min-h-[800px] bg-background",
  tokens: "flex min-h-[1006px] w-[1440px] bg-background",
  "org-page": "flex min-h-svh w-full bg-background",
  "org-1440": "flex h-[960px] w-[1440px] shrink-0 overflow-hidden bg-background",
  "org-1024": "flex h-[960px] w-[1024px] shrink-0 overflow-hidden bg-background",
};

export function reviewChromeLabelsFrom(
  labels: Readonly<{
    orgName: string;
    projectName: string;
    viewerName: string;
    viewerHandle: string;
    viewerAvatarUrl?: string | null;
  }>,
): ReviewChromeLabels {
  return {
    orgInitial: initialsOf(labels.orgName).slice(0, 1),
    orgName: labels.orgName,
    projectInitial: initialsOf(labels.projectName).slice(0, 1),
    projectName: labels.projectName,
    viewerAvatarUrl: labels.viewerAvatarUrl,
    viewerHandle: labels.viewerHandle,
    viewerInitials: initialsOf(labels.viewerName),
    viewerName: labels.viewerName,
  };
}

export function projectChromeTrail(
  labels: Pick<ReviewChromeLabels, "orgName" | "projectName">,
  section: string,
): readonly [string, string, string] {
  return [labels.orgName, labels.projectName, section];
}

export function projectChromeCrumbs(
  labels: Pick<ReviewChromeLabels, "orgName" | "projectName">,
  section: string,
): ReviewChromeCrumb[] {
  return [
    { label: labels.orgName },
    { label: labels.projectName },
    { current: true, label: section },
  ];
}

export function orgChromeCrumbs(
  orgName: string,
  section: string,
  href?: string,
): ReviewChromeCrumb[] {
  return [
    { href, label: orgName },
    { current: true, label: section },
  ];
}

export function ReviewChrome({
  account,
  bodyClassName,
  children,
  currentOrg,
  currentProject,
  frame = "board",
  labels = FIGMA_REVIEW_CHROME,
  orgHrefs,
  orgMenuOpen,
  orgSwitcherMenu,
  scope,
  trail,
}: Readonly<{
  account?: ReviewAccountMenu;
  bodyClassName?: string;
  children: ReactNode;
  currentOrg?: OrgSection;
  currentProject?: ProjectSection;
  frame?: ReviewChromeFrame;
  labels?: ReviewChromeLabels;
  orgHrefs?: ReviewOrgHrefs;
  orgMenuOpen?: boolean;
  orgSwitcherMenu?: ReactNode;
  scope: ReviewChromeScope;
  trail: readonly ReviewChromeCrumb[];
}>) {
  const last = trail.length - 1;
  const body =
    bodyClassName ??
    (frame === "board"
      ? "min-h-0 flex-1 overflow-auto px-9 pt-[52px] pb-[52px]"
      : "flex flex-1 flex-col px-9 py-13");

  return (
    <div className={FRAME_CLASS[frame]}>
      <aside
        aria-label="Sidebar"
        className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className="flex flex-col gap-4 overflow-hidden p-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <OrgSwitcher open={orgMenuOpen}>
              <OrgSwitcherTrigger initial={labels.orgInitial} />
              {orgSwitcherMenu}
            </OrgSwitcher>
            <span className="min-w-0 flex-1 truncate text-meta-strong font-semibold text-sidebar-foreground">
              {labels.orgName}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 overflow-hidden px-2">
          {scope === "project" && (
            <div className="flex flex-col gap-1">
              <ProjectSwitcher>
                <ProjectSwitcherTrigger initial={labels.projectInitial} name={labels.projectName} />
              </ProjectSwitcher>
              <nav aria-label="This project">
                {PROJECT_NAV.map((item) => (
                  <NavItem
                    active={item.label === currentProject}
                    icon={item.icon}
                    key={`project:${item.label}`}
                    label={item.label}
                  />
                ))}
              </nav>
            </div>
          )}

          {scope === "project" && (
            <div aria-hidden="true" className="h-px w-[100px] bg-sidebar-border" />
          )}

          <nav aria-label="Organization">
            {ORG_NAV.map((item) => (
              <NavItem
                active={item.label === currentOrg}
                href={orgHrefs?.[item.href]}
                icon={item.icon}
                key={`org:${item.label}`}
                label={item.label}
              />
            ))}
          </nav>
        </div>

        <div className="min-h-px flex-1" />

        <ViewerFooter account={account} labels={labels} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <TopBar
          actions={
            <>
              <SearchHint />
              <ViewerAvatar
                avatarUrl={labels.viewerAvatarUrl}
                className="size-7"
                initials={labels.viewerInitials}
              />
            </>
          }
          trail={
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
              {trail.map((crumb, index) => (
                <span className="flex items-center gap-1" key={`${crumb.label}:${index}`}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <Breadcrumb
                    asChild={crumb.href != null}
                    current={index === last || crumb.current}
                  >
                    {crumb.href != null ? <a href={crumb.href}>{crumb.label}</a> : crumb.label}
                  </Breadcrumb>
                </span>
              ))}
            </nav>
          }
        />
        <main className={body}>{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  active = false,
  href,
  icon: Icon,
  label,
}: Readonly<{ active?: boolean; href?: string; icon: LucideIcon; label: string }>) {
  const className = cn(
    "flex w-full items-center gap-2 rounded-sm px-3 py-2",
    active
      ? "bg-sidebar-accent text-body-strong font-semibold text-sidebar-foreground"
      : "text-body text-sidebar-muted-foreground",
    href != null && !active && "hover:bg-sidebar-accent/60",
  );
  const content = (
    <>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </>
  );

  if (href != null) {
    return (
      <a aria-current={active ? "page" : undefined} className={className} href={href}>
        {content}
      </a>
    );
  }

  return (
    <div
      aria-current={active ? "page" : undefined}
      className={className}
      data-active={active ? "true" : undefined}
    >
      {content}
    </div>
  );
}

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

function ViewerFooter({
  account,
  labels,
}: Readonly<{ account?: ReviewAccountMenu; labels: ReviewChromeLabels }>) {
  const identity = (
    <>
      <ViewerAvatar
        avatarUrl={labels.viewerAvatarUrl}
        className="size-8"
        initials={labels.viewerInitials}
      />
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden text-meta leading-[18px]">
        <span className="truncate font-semibold text-sidebar-foreground">{labels.viewerName}</span>
        <span className="truncate text-sidebar-muted-foreground">{labels.viewerHandle}</span>
      </span>
      <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
    </>
  );

  if (account == null) {
    return (
      <div className="flex items-center gap-2 overflow-hidden border-t border-sidebar-border p-3">
        {identity}
      </div>
    );
  }

  return (
    <div className="border-t border-sidebar-border p-3">
      <details className="group relative">
        <summary
          aria-label="Open account menu"
          className="flex w-full cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
        >
          {identity}
        </summary>
        <div className="absolute right-0 bottom-14 left-0 z-30 overflow-hidden rounded-lg border border-border bg-card p-1 text-card-foreground shadow-panel">
          <a
            className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium hover:bg-accent"
            href={account.organizationsHref}
          >
            <Building2 className="size-3.5" />
            Organizations
          </a>
          {account.onSignOut != null && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium hover:bg-accent"
              onClick={account.onSignOut}
              type="button"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

function SearchHint() {
  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-md border border-border bg-muted px-2 py-1">
      <Search aria-hidden="true" className="size-3.5 text-faint" />
      <span className="text-meta text-faint">Search</span>
      <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono text-mono text-faint">
        ⌘K
      </kbd>
    </div>
  );
}
