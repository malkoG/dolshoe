import { CheckboxPill } from "@dolshoe/ui/components/checkbox-pill";
import { DataState } from "@dolshoe/ui/components/data-state";
import { ListRow } from "@dolshoe/ui/components/list-row";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import {
  Panel,
  PanelBar,
  PanelControls,
  PanelFooter,
  PanelFooterNote,
  PanelSummary,
} from "@dolshoe/ui/components/panel";
import { SearchField } from "@dolshoe/ui/components/search-field";
import { Button } from "@dolshoe/ui/components/ui/button";
import { ChevronRight, Clock3, KeyRound, Search, Waypoints } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { RefreshButton } from "../../components/refresh-button";
import { SpanKindBadge } from "../../components/span-kind-badge";
import { formatDuration, formatRelativeTime, pluralize } from "../../lib/format";
import type { TraceSummary } from "../../lib/traces";

/**
 * Where a traces control navigates, without the view knowing the router.
 *
 * @remarks
 * The route fills this in with a typed `Link`. Factories and the silhouette
 * harness use the private hash stub so this file never imports the router.
 */
export type TracesLinkTarget = { kind: "setup" } | { kind: "trace"; traceId: string };

export interface TracesScreenLinkProps {
  target: TracesLinkTarget;
  className?: string;
  children: ReactNode;
}

export type TracesScreenStatus = "loading" | "error" | "ready";

export interface TracesScreenProps {
  errorDescription?: string;
  errorsOnly: boolean;
  onErrorsOnlyChange: (checked: boolean) => void;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  query: string;
  refreshing: boolean;
  renderLink?: (props: TracesScreenLinkProps) => ReactNode;
  status: TracesScreenStatus;
  traces: readonly TraceSummary[];
}

/**
 * A hash link the silhouette and construction test can click.
 *
 * @remarks
 * Private to this screen on purpose. The live route replaces it with a
 * TanStack `Link`; promoting a shared "screen link" would be a second
 * router for tests.
 */
function stubLink({ children, className, target }: TracesScreenLinkProps) {
  const href = target.kind === "setup" ? "#setup-reporting" : `#trace-${target.traceId}`;
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

/**
 * Narrows the loaded traces the same way the Figma panel does: a name /
 * service / id search, and an errors-only pill that hides clean traces.
 */
export function filterTraces(
  traces: readonly TraceSummary[],
  query: string,
  errorsOnly: boolean,
): TraceSummary[] {
  const normalizedQuery = query.trim().toLowerCase();

  return traces.filter((trace) => {
    if (errorsOnly && trace.errorSpanCount === 0) return false;
    if (normalizedQuery.length === 0) return true;
    return [trace.name, trace.serviceName, trace.traceId].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });
}

function panelSummary(
  status: TracesScreenStatus,
  loadedCount: number,
  visibleCount: number,
): string {
  if (status !== "ready" || loadedCount === 0) return "Traces";
  return pluralize(visibleCount, "trace");
}

/**
 * Screen 24 — the traces list Figma paints under the project chrome.
 *
 * @remarks
 * The heading and the panel are this screen's. Sidebar, top bar, and the
 * project layout that wraps the route stay where they are; this file does
 * not restyle them and does not import `PageShell`.
 */
export function TracesScreen({
  errorDescription,
  errorsOnly,
  onErrorsOnlyChange,
  onQueryChange,
  onRefresh,
  query,
  refreshing,
  renderLink = stubLink,
  status,
  traces,
}: TracesScreenProps) {
  const visible = useMemo(
    () => filterTraces(traces, query, errorsOnly),
    [traces, query, errorsOnly],
  );

  return (
    <div className="flex flex-col">
      <PageHeading>Traces</PageHeading>

      <Panel>
        <PanelBar>
          <PanelSummary>{panelSummary(status, traces.length, visible.length)}</PanelSummary>

          <PanelControls>
            <SearchField
              label="Search traces"
              onValueChange={onQueryChange}
              placeholder="Search names, services, trace ids…"
              value={query}
            />

            <CheckboxPill
              checked={errorsOnly}
              label="Errors only"
              onCheckedChange={onErrorsOnlyChange}
            />

            <RefreshButton
              label="Check for new traces"
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          </PanelControls>
        </PanelBar>

        <div aria-live="polite">
          {status === "loading" && (
            <DataState
              description="Fetching the newest traces from the API."
              kind="loading"
              title="Loading traces…"
            />
          )}

          {status === "error" && (
            <DataState
              description={errorDescription ?? "Something went wrong while loading traces."}
              kind="error"
              onRetry={onRefresh}
              title="Couldn't load traces"
            />
          )}

          {status === "ready" && traces.length === 0 && (
            <DataState
              action={
                <Button asChild size="sm" variant="outline">
                  {renderLink({
                    target: { kind: "setup" },
                    children: (
                      <>
                        <KeyRound />
                        Set up reporting
                      </>
                    ),
                  })}
                </Button>
              }
              description="Spans reach this project as OTLP over the same DSN, from an OpenTelemetry SDK, a collector, or a reporter's own spans. Nothing has exported one yet."
              icon={Waypoints}
              kind="empty"
              title="No traces yet"
            />
          )}

          {status === "ready" && traces.length > 0 && visible.length === 0 && (
            <DataState
              description={errorsOnly ? "No trace here has a failing span." : "Try another search."}
              icon={Search}
              kind="empty"
              title="No matching traces"
            />
          )}

          {status === "ready" && visible.length > 0 && (
            <ul>
              {visible.map((trace) => (
                <TraceRow key={trace.traceId} renderLink={renderLink} trace={trace} />
              ))}
            </ul>
          )}
        </div>

        {status === "ready" && traces.length > 0 && (
          <PanelFooter>
            <span>
              Showing <strong className="font-bold text-foreground">{visible.length}</strong> of{" "}
              {traces.length} traces
            </span>
            <PanelFooterNote>Sorted newest first</PanelFooterNote>
          </PanelFooter>
        )}
      </Panel>
    </div>
  );
}

function TraceRow({
  renderLink,
  trace,
}: Readonly<{
  renderLink: (props: TracesScreenLinkProps) => ReactNode;
  trace: TraceSummary;
}>) {
  return (
    <ListRow>
      {renderLink({
        target: { kind: "trace", traceId: trace.traceId },
        className:
          "grid grid-cols-1 items-start gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-muted sm:grid-cols-[66px_minmax(0,1fr)_auto_auto_16px] sm:items-center",
        children: (
          <>
            <SpanKindBadge className="w-full sm:w-[66px]" kind={trace.kind} />

            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{trace.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                <strong className="font-semibold">{trace.serviceName}</strong>
                <span aria-hidden="true" className="text-faint">
                  ·
                </span>
                {pluralize(trace.spanCount, "span")}
                {trace.errorSpanCount > 0 && (
                  <>
                    <span aria-hidden="true" className="text-faint">
                      ·
                    </span>
                    <span className="font-semibold text-brand">
                      {pluralize(trace.errorSpanCount, "failing", "failing")}
                    </span>
                  </>
                )}
                {trace.environment != null && (
                  <>
                    <span aria-hidden="true" className="text-faint">
                      ·
                    </span>
                    {trace.environment}
                  </>
                )}
              </div>
            </div>

            <span className="font-mono text-[12px] whitespace-nowrap tabular-nums text-muted-foreground">
              {formatDuration(trace.durationNanoseconds)}
            </span>

            <span className="flex items-center gap-1 font-mono text-[12px] whitespace-nowrap text-muted-foreground">
              <Clock3 className="size-3.5" />
              <time dateTime={trace.startedAt} title={trace.startedAt}>
                {formatRelativeTime(trace.startedAt)}
              </time>
            </span>

            <ChevronRight className="hidden size-4 text-faint sm:block" />
          </>
        ),
      })}
    </ListRow>
  );
}
