import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { Fragment, type ReactNode } from "react";

import { LogsScreen, type LogsScreenProps } from "./logs-screen";

/**
 * The trail Figma framed on both Logs screens — org / project / current page.
 * Photographed here; the live route reads the same labels from PageShell.
 */
export const FIGMA_LOGS_TRAIL = [
  { label: "Acme Payments" },
  { label: "checkout-api" },
  { label: "Logs" },
] as const;

export type LogsTrailCrumb = {
  label: string;
};

/**
 * Private TopBar for Logs silhouettes.
 *
 * @remarks
 * PageShell already paints the live trail. This stub exists so a named
 * state can photograph Acme Payments / checkout-api / Logs without booting
 * the shell — and without the route rendering a second bar.
 */
export function LogsChrome({
  children,
  trail,
}: Readonly<{ children: ReactNode; trail: readonly LogsTrailCrumb[] }>) {
  const last = trail.length - 1;

  return (
    <div>
      <TopBar
        trail={
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
            {trail.map((crumb, index) => (
              <Fragment key={`${crumb.label}:${index}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <Breadcrumb current={index === last}>{crumb.label}</Breadcrumb>
              </Fragment>
            ))}
          </nav>
        }
      />
      <div className="flex flex-col gap-4 px-9 py-8">{children}</div>
    </div>
  );
}

/**
 * The composition root a construction test and a silhouette share: chrome
 * around the public view. The live route renders `LogsScreen` alone.
 */
export function LogsReviewView(props: LogsScreenProps) {
  return (
    <LogsChrome trail={FIGMA_LOGS_TRAIL}>
      <LogsScreen {...props} />
    </LogsChrome>
  );
}
