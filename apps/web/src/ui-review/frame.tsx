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
 */
export function ReviewFrame({
  children,
  framed = true,
}: Readonly<{ children: ReactNode; framed?: boolean }>) {
  return (
    <div className="min-h-screen p-8" data-review-root>
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
