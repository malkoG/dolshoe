import type { ReactNode } from "react";

import { FIGMA_REVIEW_CHROME, ReviewChrome, orgChromeCrumbs } from "../_chrome/review-chrome";
import { OrgSettings, type OrgSettingsProps } from "./org-settings";

/**
 * The Figma org-settings chrome — sidebar, TopBar trail, then the body.
 *
 * @remarks
 * Named-state silhouettes and the construction test mount this. The live
 * route already sits under `PageShell` and must not.
 */
export function OrgSettingsChrome({
  children,
  orgName = FIGMA_REVIEW_CHROME.orgName,
}: Readonly<{
  children: ReactNode;
  orgName?: string;
}>) {
  return (
    <ReviewChrome
      currentOrg="Settings"
      frame="page"
      labels={{ ...FIGMA_REVIEW_CHROME, orgName }}
      scope="org"
      trail={orgChromeCrumbs(orgName, "Settings")}
    >
      {children}
    </ReviewChrome>
  );
}

/**
 * The composition the silhouette photographs: shared chrome, then the
 * public settings view. The route renders `OrgSettings` alone.
 */
export function OrgSettingsReview(props: OrgSettingsProps) {
  return (
    <OrgSettingsChrome>
      <OrgSettings {...props} />
    </OrgSettingsChrome>
  );
}
