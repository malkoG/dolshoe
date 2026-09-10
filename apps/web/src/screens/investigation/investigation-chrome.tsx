import type { ReactNode } from "react";

import { ReviewChrome } from "../_chrome/review-chrome";
import type { InvestigationCrumb } from "./types";

/**
 * Sidebar + TopBar + padded body — the Figma page chrome, photographed only.
 *
 * @remarks
 * Named states pass a trail so a silhouette can show the full layout. The
 * live route omits the trail; PageShell already owns this chrome.
 */
export function InvestigationChrome({
  children,
  trail,
}: Readonly<{ children: ReactNode; trail: readonly InvestigationCrumb[] }>) {
  return (
    <ReviewChrome currentProject="Traces" frame="page" scope="project" trail={trail}>
      {children}
    </ReviewChrome>
  );
}
