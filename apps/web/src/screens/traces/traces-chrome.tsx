import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { TracesScreen, type TracesScreenProps } from "./traces-screen";

/**
 * The trail Figma paints on screen 24's TopBar.
 *
 * @remarks
 * Private to the silhouette. The live route already gets this trail from
 * `PageShell` + `RouteBreadcrumbTrail`; wrapping the body in this chrome
 * there would nest two bars.
 */
export const tracesChromeTrail = ["Acme Payments", "checkout-api", "Traces"] as const;

function TracesChromeActions() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-2 py-1">
        <Search aria-hidden="true" className="size-3.5 text-faint" />
        <span className="text-[12px] font-medium text-faint">Search</span>
        <kbd className="rounded-[3px] border border-input bg-card px-1 font-mono text-[12px] text-faint">
          ⌘K
        </kbd>
      </div>
      <div
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-lg bg-identity font-mono text-[9px] font-medium tracking-[0.06em] text-identity-foreground uppercase"
      >
        KW
      </div>
    </div>
  );
}

/**
 * TopBar + trail for the named-state photograph, not for the live route.
 *
 * @remarks
 * Composed from `@dolshoe/ui` breadcrumbs so the silhouette uses the same
 * tokens as PageShell without importing or editing PageShell.
 */
export function TracesReviewChrome({ children }: Readonly<{ children: ReactNode }>) {
  const [org, project, page] = tracesChromeTrail;

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        actions={<TracesChromeActions />}
        trail={
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
            <Breadcrumb>{org}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb>{project}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb current>{page}</Breadcrumb>
          </nav>
        }
      />
      <div className="px-9 py-13">{children}</div>
    </div>
  );
}

/**
 * The composition the construction test and the silhouette harness share.
 *
 * @remarks
 * Factories still return body props. This wrapper is what paints the
 * Figma frame the reviewer declined the first photograph for.
 */
export function TracesReviewSurface(props: TracesScreenProps) {
  return (
    <TracesReviewChrome>
      <TracesScreen {...props} />
    </TracesReviewChrome>
  );
}
