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
 * again would photograph a second border the design does not have. Project
 * settings is a full Sidebar + TopBar + body page; a card around that
 * chrome reads as a panel. Report detail is the same shape.
 *
 * `inset` is the default paper margin. Full-page surfaces drop it so the
 * sidebar and breadcrumb TopBar sit flush the way Figma draws the page.
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
