import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
import type { ReactNode } from "react";

import {
  FIGMA_REVIEW_CHROME,
  ReviewChrome,
  orgChromeCrumbs,
  type ReviewChromeFrame,
} from "../_chrome/review-chrome";
import { MembersScreen, type MembersScreenProps } from "./members-screen";

/**
 * Org chrome the silhouettes photograph — not the live route.
 *
 * @remarks
 * PageShell already paints Sidebar + TopBar on `/orgs/$orgSlug/members`.
 * Named states mount shared `ReviewChrome` (org scope, Acme Payments /
 * Members) so a silhouette is Sidebar + TopBar + body. The 400 viewport is
 * the Figma shell-outside: no rail, hamburger + trail only.
 */
export type MembersChromeFrame = Extract<ReviewChromeFrame, "org-1440" | "org-1024"> | "mobile";

export interface MembersReviewProps extends MembersScreenProps {
  chromeFrame?: MembersChromeFrame;
}

function SidebarTriggerStub() {
  return (
    <span
      aria-hidden="true"
      className="flex flex-col justify-center gap-[3px]"
      data-slot="sidebar-trigger-stub"
    >
      <span className="h-0.5 w-4 bg-foreground" />
      <span className="h-0.5 w-4 bg-foreground" />
      <span className="h-0.5 w-4 bg-foreground" />
    </span>
  );
}

function MembersMobileShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex h-[940px] w-[400px] flex-col overflow-hidden bg-background">
      <TopBar
        className="px-4"
        actions={
          <Avatar className="size-7 rounded-lg bg-identity">
            <AvatarFallback className="rounded-lg bg-identity font-mono text-badge tracking-[0.06em] text-identity-on uppercase">
              {FIGMA_REVIEW_CHROME.viewerInitials}
            </AvatarFallback>
          </Avatar>
        }
        trail={
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
            <SidebarTriggerStub />
            <Breadcrumb>{FIGMA_REVIEW_CHROME.orgName}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb current>Members</Breadcrumb>
          </nav>
        }
      />
      <main className="min-h-0 flex-1 overflow-auto px-5 py-10">{children}</main>
    </div>
  );
}

export function MembersChrome({
  children,
  chromeFrame = "org-1440",
}: Readonly<{
  children: ReactNode;
  chromeFrame?: MembersChromeFrame;
}>) {
  if (chromeFrame === "mobile") {
    return <MembersMobileShell>{children}</MembersMobileShell>;
  }

  return (
    <ReviewChrome
      bodyClassName="min-h-0 flex-1 overflow-auto px-9 py-13"
      currentOrg="Members"
      frame={chromeFrame}
      scope="org"
      trail={orgChromeCrumbs(FIGMA_REVIEW_CHROME.orgName, "Members")}
    >
      {children}
    </ReviewChrome>
  );
}

/**
 * The composition the silhouette photographs: shared chrome, then the
 * public members view. The route renders `MembersScreen` alone.
 */
export function MembersReview({ chromeFrame = "org-1440", ...screen }: MembersReviewProps) {
  return (
    <MembersChrome chromeFrame={chromeFrame}>
      <MembersScreen {...screen} />
    </MembersChrome>
  );
}
