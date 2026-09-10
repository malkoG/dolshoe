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
 */
export function ReviewFrame({
  children,
  framed = true,
  inset = true,
}: Readonly<{ children: ReactNode; framed?: boolean; inset?: boolean }>) {
  return (
    <div className={inset ? "min-h-screen p-8" : "min-h-screen"} data-review-root>
      {framed ? (
        <div className="overflow-hidden rounded-xl border border-input bg-card shadow-panel">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
