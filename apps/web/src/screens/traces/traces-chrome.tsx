import type { ReactNode } from "react";

import {
  FIGMA_REVIEW_CHROME,
  ReviewChrome,
  projectChromeCrumbs,
  projectChromeTrail,
  type ReviewChromeLabels,
} from "../_chrome/review-chrome";
import { TracesScreen, type TracesScreenProps } from "./traces-screen";

export type TracesChrome = ReviewChromeLabels;

export const tracesFigmaChrome = FIGMA_REVIEW_CHROME;

export const tracesChromeTrail = projectChromeTrail(tracesFigmaChrome, "Traces");

/**
 * Sidebar + TopBar + body for the named-state photograph, not the live route.
 */
export function TracesReviewChrome({
  children,
  chrome = tracesFigmaChrome,
}: Readonly<{ children: ReactNode; chrome?: TracesChrome }>) {
  return (
    <ReviewChrome
      currentProject="Traces"
      labels={chrome}
      scope="project"
      trail={projectChromeCrumbs(chrome, "Traces")}
    >
      {children}
    </ReviewChrome>
  );
}

/** The composition the construction test and the silhouette harness share. */
export function TracesReviewSurface(props: TracesScreenProps) {
  return (
    <TracesReviewChrome>
      <TracesScreen {...props} />
    </TracesReviewChrome>
  );
}
