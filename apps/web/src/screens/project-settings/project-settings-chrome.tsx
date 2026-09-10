import { PageHeading } from "@dolshoe/ui/components/page-heading";
import type { ReactNode } from "react";

import { FIGMA_REVIEW_CHROME, ReviewChrome, projectChromeCrumbs } from "../_chrome/review-chrome";
import { ProjectSettings, type ProjectSettingsProps } from "./project-settings";

/**
 * The Figma project-settings chrome — sidebar, TopBar trail, then the body.
 *
 * @remarks
 * Named-state silhouettes and the construction test mount this. The live
 * route already sits under `PageShell` and must not.
 */
export function ProjectSettingsChrome({
  children,
  orgName = FIGMA_REVIEW_CHROME.orgName,
  projectName = FIGMA_REVIEW_CHROME.projectName,
}: Readonly<{
  children: ReactNode;
  orgName?: string;
  projectName?: string;
}>) {
  const labels = { ...FIGMA_REVIEW_CHROME, orgName, projectName };

  return (
    <ReviewChrome
      bodyClassName="flex flex-1 flex-col gap-4 px-9 py-13"
      currentProject="Settings"
      frame="page"
      labels={labels}
      scope="project"
      trail={projectChromeCrumbs(labels, "Settings")}
    >
      <PageHeading className="mb-0">Settings</PageHeading>
      {children}
    </ReviewChrome>
  );
}

/**
 * The composition the silhouette photographs: shared chrome, then the
 * public settings view. The route renders `ProjectSettings` alone.
 */
export function ProjectSettingsReview(props: ProjectSettingsProps) {
  return (
    <ProjectSettingsChrome>
      <ProjectSettings {...props} />
    </ProjectSettingsChrome>
  );
}
