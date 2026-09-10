import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import type { ReactNode } from "react";

import { ProjectSettings, type ProjectSettingsProps } from "./project-settings";

/**
 * The Figma TopBar trail for this screen — org / project / Settings.
 *
 * @remarks
 * Named-state silhouettes and the construction test mount this. The live
 * route already sits under `PageShell`'s real bar and must not. Mounting
 * both would photograph a second trail on a page that already has one.
 */
export function ProjectSettingsChrome({
  children,
  orgName = "Acme Payments",
  projectName = "checkout-api",
}: Readonly<{
  children: ReactNode;
  orgName?: string;
  projectName?: string;
}>) {
  return (
    <div>
      <TopBar
        trail={
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
            <Breadcrumb>{orgName}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb>{projectName}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb current>Settings</Breadcrumb>
          </nav>
        }
      />
      <div className="px-9 py-10">{children}</div>
    </div>
  );
}

/**
 * The composition the silhouette photographs: private chrome, then the
 * public settings view. The route renders `ProjectSettings` alone.
 */
export function ProjectSettingsReview(props: ProjectSettingsProps) {
  return (
    <ProjectSettingsChrome>
      <ProjectSettings {...props} />
    </ProjectSettingsChrome>
  );
}
