import type { ReactNode } from "react";

import {
  FIGMA_REVIEW_CHROME,
  ReviewChrome,
  projectChromeCrumbs,
  type ReviewChromeCrumb,
  type ReviewChromeLabels,
} from "../_chrome/review-chrome";
import { LogsScreen, type LogsScreenProps } from "./logs-screen";

export type LogsChromeFixture = ReviewChromeLabels;

export const logsFigmaChrome = FIGMA_REVIEW_CHROME;

export const FIGMA_LOGS_TRAIL = projectChromeCrumbs(logsFigmaChrome, "Logs");

export type LogsTrailCrumb = ReviewChromeCrumb;

/**
 * Sidebar + TopBar + body for the named-state photograph, not the live route.
 */
export function LogsChrome({
  children,
  chrome = logsFigmaChrome,
  trail = FIGMA_LOGS_TRAIL,
}: Readonly<{
  children: ReactNode;
  chrome?: LogsChromeFixture;
  trail?: readonly LogsTrailCrumb[];
}>) {
  return (
    <ReviewChrome currentProject="Logs" labels={chrome} scope="project" trail={trail}>
      {children}
    </ReviewChrome>
  );
}

/** The composition the construction test and the silhouette harness share. */
export function LogsReviewView(props: LogsScreenProps) {
  return (
    <LogsChrome>
      <LogsScreen {...props} />
    </LogsChrome>
  );
}
