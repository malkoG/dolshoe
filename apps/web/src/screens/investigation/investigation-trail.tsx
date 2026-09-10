import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { Fragment } from "react";

import type { InvestigationCrumb } from "./types";

/**
 * The Figma location trail above Investigation — TopBar plus crumbs, no
 * search, sidebar trigger, or avatar.
 *
 * @remarks
 * Private to this screen. PageShell owns the live trail; this stub exists so
 * a named state can photograph the same crumbs without opening the shell.
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
