import { cn } from "@dolshoe/ui/lib/utils";
import type { ReactNode } from "react";

import type { ReviewPaper } from "./surfaces";

/**
 * The paper a silhouette is photographed on.
 *
 * @remarks
 * The harness is a composition root, not a second design system. It imports
 * the application's stylesheet so the tokens in `@dolshoe/ui` are the ones
 * that paint, and it stops there.
 *
 * `panel` is the default: a padded review card for a single widget, or for
 * Login / Invitation which have no PageShell. `framed-fit` is that card
 * shrunk to a 1440×960 private-chrome board. `full-page` drops the card so
 * Sidebar + TopBar sit flush the way Figma draws those screens.
 */
export function ReviewFrame({
  children,
  paper = "panel",
}: Readonly<{ children: ReactNode; paper?: ReviewPaper }>) {
  const inset = paper !== "full-page";
  const framed = paper !== "full-page";
  const fit = paper === "framed-fit";

  return (
    <div className={inset ? "min-h-screen p-8" : "min-h-screen"} data-review-root>
      {framed ? (
        <div
          className={cn(
            "overflow-hidden rounded-xl border border-input bg-card shadow-panel",
            fit && "w-fit",
          )}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
