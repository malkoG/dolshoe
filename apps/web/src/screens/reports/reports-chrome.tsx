import { Breadcrumb, BreadcrumbSeparator, TopBar } from "@dolshoe/ui/components/breadcrumb";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { ReportsView } from "./reports-view";
import type { ReportsViewProps } from "./reports-view";

export const REPORTS_CHROME_ORG = "Acme Payments";
export const REPORTS_CHROME_PROJECT = "checkout-api";

/**
 * The Figma TopBar trail this screen is reviewed against.
 *
 * @remarks
 * A private stub, not a second page-shell. Named states and silhouettes
 * photograph it so the trail is in the PNG; the live route stays body-only
 * under `PageShell`, which already owns the real TopBar.
 */
export function ReportsChrome({
  children,
  org = REPORTS_CHROME_ORG,
  project = REPORTS_CHROME_PROJECT,
}: Readonly<{
  children: ReactNode;
  org?: string;
  project?: string;
}>) {
  return (
    <div>
      <TopBar
        actions={<ReportsChromeActions />}
        trail={
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
            <Breadcrumb>{org}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb>{project}</Breadcrumb>
            <BreadcrumbSeparator />
            <Breadcrumb current>Reports</Breadcrumb>
          </nav>
        }
      />
      <div className="px-9 pt-13 pb-13">{children}</div>
    </div>
  );
}

function ReportsChromeActions() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1">
        <Search aria-hidden="true" className="size-3.5 text-faint" />
        <span className="text-meta text-faint">Search</span>
        <kbd className="rounded-[3px] border border-border bg-card px-1 font-mono text-mono text-faint">
          ⌘K
        </kbd>
      </div>
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-md bg-identity font-mono text-badge text-identity-on uppercase"
      >
        KW
      </span>
    </div>
  );
}

/** The composition a construction test and a silhouette mount. */
export function ReportsNamedState(props: Readonly<ReportsViewProps>) {
  return (
    <ReportsChrome>
      <ReportsView {...props} />
    </ReportsChrome>
  );
}
