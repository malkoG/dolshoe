import { cn } from "@dolshoe/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The paper a silhouette is photographed on.
 *
 * @remarks
 * The harness is a composition root, not a second design system. It imports
 * the application's stylesheet so the tokens in `@dolshoe/ui` are the ones
 * that paint, and it stops there.
 *
 * `framed` is the default because ExceptionTree and the dashboard are a
 * single panel. Investigation already is a stack of cards — wrapping it
 * again would photograph a second border the design does not have.
 *
 * `inset` is the default paper margin. Investigation drops it so the
 * breadcrumb TopBar can sit flush the way Figma draws the page; the view
 * pads its own cards when it is given a trail.
 *
 * `fit` shrinks the card to the view's width. Traces photographs a 1440×960
 * layout chrome; without it the card stretches to the capture viewport.
 */
export function ReviewFrame({
  children,
  fit = false,
  framed = true,
  inset = true,
}: Readonly<{ children: ReactNode; fit?: boolean; framed?: boolean; inset?: boolean }>) {
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
