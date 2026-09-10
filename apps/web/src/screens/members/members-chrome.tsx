import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { Avatar, AvatarFallback } from "@dolshoe/ui/components/ui/avatar";
import { cn } from "@dolshoe/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Org chrome the silhouettes photograph — not the live route.
 *
 * @remarks
 * PageShell already paints the TopBar on `/orgs/$orgSlug/members`. This stub
 * exists so a named state can show the same Figma trail (org / Members)
 * without booting the router or editing shared layout. Desktop matches the
 * 56px bar; mobile adds the sidebar trigger Figma puts on the 400 viewport.
 */
export type MembersChromeVariant = "desktop" | "mobile";

export interface MembersChromeProps {
  children: ReactNode;
  className?: string;
  orgName?: string;
  variant?: MembersChromeVariant;
  viewerInitials?: string;
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

export function MembersChrome({
  children,
  className,
  orgName = "Acme Payments",
  variant = "desktop",
  viewerInitials = "KW",
}: MembersChromeProps) {
  const mobile = variant === "mobile";

  return (
    <div className={cn("bg-background", className)}>
      <TopBar
        className={cn("sticky top-0 z-20 bg-card", mobile && "px-4")}
        trail={
          <>
            {mobile && <SidebarTriggerStub />}
            <Breadcrumb>{orgName}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb current>Members</Breadcrumb>
          </>
        }
        actions={
          <Avatar className="size-7 rounded-lg">
            <AvatarFallback className="rounded-lg bg-identity text-[9px] font-medium tracking-[0.06em] text-identity-foreground">
              {viewerInitials}
            </AvatarFallback>
          </Avatar>
        }
      />
      <div className={cn(mobile ? "px-5 py-10" : "px-9 py-13")}>{children}</div>
    </div>
  );
}
