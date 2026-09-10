import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { PanelFooter, PanelFooterNote } from "@dolshoe/ui/components/panel";
import type { ReactNode } from "react";

import { ErrorAttach } from "./error-attach";
import { InvestigationChrome } from "./investigation-chrome";
import { InvestigationHeader } from "./investigation-header";
import { LogAttach } from "./log-attach";
import { PendingSpanSlot } from "./pending-span-slot";
import { SpanDetails } from "./span-details";
import { SpanRow } from "./span-row";
import type {
  Investigation,
  InvestigationCrumb,
  InvestigationSpan,
  InvestigationViewProps,
  PendingParentSlot,
} from "./types";

/**
 * A tree row is a span or a pending-parent placeholder — never an error or
 * a log. Those hang off the span they named.
 */
type TreeRow =
  | { kind: "span"; span: InvestigationSpan }
  | { kind: "pending-parent"; slot: PendingParentSlot };

function treeRows(investigation: Investigation): TreeRow[] {
  const pendingByBefore = new Map(
    investigation.pendingParents.map((slot) => [slot.beforeSpanId, slot]),
  );
  const rows: TreeRow[] = [];

  for (const span of investigation.spans) {
    const pending = pendingByBefore.get(span.spanId);
    if (pending != null) rows.push({ kind: "pending-parent", slot: pending });
    rows.push({ kind: "span", span });
  }

  return rows;
}

function InvestigationBody({
  children,
  trail,
}: Readonly<{ children: ReactNode; trail?: readonly InvestigationCrumb[] }>) {
  const stack = <div className="flex flex-col gap-4">{children}</div>;
  if (trail == null || trail.length === 0) return stack;

  return <InvestigationChrome trail={trail}>{stack}</InvestigationChrome>;
}

/**
 * The public Investigation view.
 *
 * @remarks
 * Receives values. It does not know about session cookies, `fetch`, or the
 * live API. Loading is a state this surface can actually show — Figma frame
 * `96:702` — so it lives here rather than only in the route.
 *
 * The tree walks spans and derived pending-parent slots. Errors and logs are
 * rendered under the span they attached to. There is no `Span | Error | Log`
 * union for a row to switch on.
 *
 * `trail` is optional. Named states pass the Figma crumbs so a silhouette
 * can photograph Sidebar + TopBar + body. The live route omits it;
 * PageShell already paints that chrome.
 */
export function InvestigationView(props: InvestigationViewProps) {
  if (props.status === "loading") {
    return (
      <InvestigationBody trail={props.trail}>
        <PageHeading className="mb-0">Investigation</PageHeading>
        <DataState
          description="Fetching this trace's spans from the API."
          kind="loading"
          title="Loading trace…"
        />
      </InvestigationBody>
    );
  }

  const { investigation, expandedSpanId, onOpenReport, onToggleSpan, trail } = props;
  const rows = treeRows(investigation);

  return (
    <InvestigationBody trail={trail}>
      <InvestigationHeader investigation={investigation} />

      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          if (row.kind === "pending-parent") {
            return <PendingSpanSlot key={`pending:${row.slot.spanId}`} slot={row.slot} />;
          }

          const expanded = row.span.spanId === expandedSpanId;

          return (
            <div className="flex flex-col gap-1" key={row.span.spanId}>
              <SpanRow
                expanded={expanded}
                onToggle={onToggleSpan == null ? undefined : () => onToggleSpan(row.span.spanId)}
                span={row.span}
                traceDuration={investigation.durationNanoseconds}
              />
              {expanded && <SpanDetails span={row.span} />}
              {row.span.errors.map((error) => (
                <div className="pl-8" key={error.reportId}>
                  <ErrorAttach error={error} onOpenReport={onOpenReport} />
                </div>
              ))}
              {row.span.logs.map((log) => (
                <div className="pl-8" key={log.id}>
                  <LogAttach log={log} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <PanelFooter>
        <span>
          Showing{" "}
          <strong className="font-bold text-foreground">
            {investigation.shownSpanCount.toLocaleString("en")}
          </strong>{" "}
          spans
        </span>
        <PanelFooterNote>
          {investigation.truncated
            ? "This trace holds more spans than are shown"
            : "Nested by parent, oldest first"}
        </PanelFooterNote>
      </PanelFooter>
    </InvestigationBody>
  );
}
