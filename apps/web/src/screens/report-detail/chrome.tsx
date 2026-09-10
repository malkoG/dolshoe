import type { ReactNode } from "react";

import {
  FIGMA_REVIEW_CHROME,
  ReviewChrome,
  type ReviewChromeCrumb,
  type ReviewChromeLabels,
} from "../_chrome/review-chrome";

export interface ReportDetailChrome extends ReviewChromeLabels {
  trail: readonly ReviewChromeCrumb[];
}

export function ReportDetailFrame({
  chrome,
  children,
}: Readonly<{ chrome: ReportDetailChrome; children: ReactNode }>) {
  const { trail, ...labels } = chrome;

  return (
    <ReviewChrome
      currentProject="Reports"
      frame="page"
      labels={{ ...FIGMA_REVIEW_CHROME, ...labels }}
      scope="project"
      trail={trail}
    >
      {children}
    </ReviewChrome>
  );
}
