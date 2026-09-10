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
import { Boxes, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { ReviewChrome, orgChromeCrumbs, type ReviewChromeFrame } from "../_chrome/review-chrome";
import {
  OrgProjects,
  type OrgMarkTone,
  type OrgProjectsHrefs,
  type OrgProjectsOrganization,
  type OrgProjectsProps,
  type OrgProjectsViewer,
} from "./org-projects";

/**
 * Org chrome for the projects screen.
 *
 * @remarks
 * Named-state silhouettes and the construction test mount this. The live
 * route already sits under `PageShell` and must not. The switcher menu is
 * this screen's distinctive photograph — the rail and trail come from the
 * shared composition.
 */

const MARK_TONE_CLASS: Record<OrgMarkTone, string> = {
  brand: "bg-brand text-brand-on",
  info: "bg-info text-brand-on",
  identity: "bg-identity text-identity-on",
  violet: "bg-violet text-brand-on",
  success: "bg-success text-brand-on",
};

const FRAME: Record<"page" | "1440" | "1024", ReviewChromeFrame> = {
  page: "org-page",
  "1440": "org-1440",
  "1024": "org-1024",
};

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
    <ReviewChrome
      account={{ organizationsHref: hrefs.organizations, onSignOut }}
      currentOrg="All projects"
      frame={FRAME[frame]}
      labels={{
        orgInitial: organization.initial,
        orgName: organization.name,
        projectInitial: "",
        projectName: "",
        viewerAvatarUrl: viewer.avatarUrl,
        viewerHandle: viewer.handle,
        viewerInitials: viewer.initials,
        viewerName: viewer.name,
      }}
      orgHrefs={hrefs}
      orgMenuOpen={orgMenuOpen}
      orgSwitcherMenu={
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
      }
      scope="org"
      trail={orgChromeCrumbs(organization.name, "Projects", hrefs.projects)}
    >
      {children}
    </ReviewChrome>
  );
}

/**
 * The composition the silhouette photographs: shared chrome, then the
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
