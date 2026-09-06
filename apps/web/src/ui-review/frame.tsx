import type { ReactNode } from "react";

/**
 * The paper a silhouette is photographed on.
 *
 * @remarks
 * The harness is a composition root, not a second design system. It imports
 * the application's stylesheet so the tokens in `@dolshoe/ui` are the ones
 * that paint, and it stops there.
 */
export function ReviewFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen p-8" data-review-root>
      <div className="overflow-hidden rounded-xl border border-input bg-card shadow-panel">
        {children}
      </div>
    </div>
  );
}
