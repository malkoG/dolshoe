import type { ReactNode } from "react";

import {
  FIGMA_REVIEW_CHROME,
  ReviewChrome,
  projectChromeCrumbs,
  projectChromeTrail,
  type ReviewChromeLabels,
} from "../_chrome/review-chrome";
import { ReportsView, type ReportsViewProps } from "./reports-view";

export type ReportsChromeLabels = ReviewChromeLabels;

export const REPORTS_FIGMA_CHROME = FIGMA_REVIEW_CHROME;

export const reportsChromeTrail = projectChromeTrail(REPORTS_FIGMA_CHROME, "Reports");

/**
 * The Figma page chrome this screen is reviewed against.
 */
export function ReportsChrome({
  children,
  chrome = REPORTS_FIGMA_CHROME,
}: Readonly<{
  children: ReactNode;
  chrome?: ReportsChromeLabels;
}>) {
  return (
    <ReviewChrome
      currentProject="Reports"
      labels={chrome}
      scope="project"
      trail={projectChromeCrumbs(chrome, "Reports")}
    >
      {children}
    </ReviewChrome>
  );
}

/** The composition a construction test and a silhouette mount. */
export function ReportsNamedState(props: Readonly<ReportsViewProps>) {
  return (
    <ReportsChrome>
      <ReportsView {...props} />
    </ReportsChrome>
  );
}
