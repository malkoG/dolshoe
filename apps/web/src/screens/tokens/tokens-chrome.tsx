import { PageHeading } from "@dolshoe/ui/components/page-heading";
import type { ReactNode } from "react";

import {
  ReviewChrome,
  projectChromeCrumbs,
  reviewChromeLabelsFrom,
} from "../_chrome/review-chrome";

/**
 * Chrome values the Tokens silhouette paints. The live route does not pass
 * these — PageShell already wraps that composition root.
 */
export interface TokensChrome {
  orgName: string;
  projectName: string;
  viewerName: string;
  viewerHandle: string;
}

/**
 * A Tokens stand-in for the project shell.
 */
export function TokensChrome({
  children,
  chrome,
}: Readonly<{ children: ReactNode; chrome: TokensChrome }>) {
  const labels = reviewChromeLabelsFrom(chrome);

  return (
    <ReviewChrome
      bodyClassName="px-9 pt-13 pb-[52px]"
      currentProject="Tokens"
      frame="tokens"
      labels={labels}
      scope="project"
      trail={projectChromeCrumbs(labels, "Tokens")}
    >
      <PageHeading>Tokens</PageHeading>
      {children}
    </ReviewChrome>
  );
}
