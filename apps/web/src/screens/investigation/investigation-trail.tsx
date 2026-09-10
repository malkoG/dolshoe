import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { Fragment } from "react";

import type { InvestigationCrumb } from "./types";

/**
 * The Figma location trail — TopBar plus crumbs.
 *
 * @remarks
 * Private to this screen. InvestigationChrome sits this bar beside the
 * sidebar. PageShell owns the live trail.
 */
export function InvestigationTrail({
  crumbs,
}: Readonly<{ crumbs: readonly InvestigationCrumb[] }>) {
  return (
    <TopBar
      aria-label="Breadcrumb"
      role="navigation"
      trail={crumbs.map((crumb, index) => (
        <Fragment key={`${index}:${crumb.label}`}>
          {index > 0 ? <BreadcrumbSeparator /> : null}
          <Breadcrumb current={crumb.current}>{crumb.label}</Breadcrumb>
        </Fragment>
      ))}
    />
  );
}
