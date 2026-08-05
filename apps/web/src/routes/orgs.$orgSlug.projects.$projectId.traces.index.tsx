import { DataState } from "@dolshoe/ui/components/data-state";
import {
  Panel,
  PanelBar,
  PanelControls,
  PanelFooter,
  PanelFooterNote,
  PanelSummary,
} from "@dolshoe/ui/components/panel";
import { SearchField } from "@dolshoe/ui/components/search-field";
import { Checkbox } from "@dolshoe/ui/components/ui/checkbox";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Clock3, Search, Waypoints } from "lucide-react";
import { useMemo } from "react";

import { RefreshButton } from "../components/refresh-button";
import { SpanKindBadge } from "../components/span-kind-badge";
import { describeError } from "../lib/api-request";
import { formatDuration, formatRelativeTime, pluralize } from "../lib/format";
import { flagParam, textParam } from "../lib/list-filters";
import { fetchTraces } from "../lib/traces";
import { useResource } from "../lib/use-resource";
import { useUrlTextFilter } from "../lib/use-url-text-filter";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/traces/")({
  validateSearch: (search: Record<string, unknown>): { q?: string; errors?: true } => ({
    q: textParam(search.q),
    errors: flagParam(search.errors),
  }),
  component: Traces,
});

function Traces() {
  const { orgSlug, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const errorsOnly = search.errors === true;

  function setFilters(next: { q?: string; errors?: true }): void {
    void navigate({ replace: true, search: (previous) => ({ ...previous, ...next }) });
  }

  const { draft, setDraft } = useUrlTextFilter(query, (q) => setFilters({ q }));

  const { refreshing, reload, state } = useResource(
    ({ signal }) => fetchTraces(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  const traces = state.status === "ready" ? state.data : [];

  // Both filters are client-side, unlike the logs page's severity. The listing
  // is bounded to whole traces rather than to individual rows, and every summary
  // already carries its error count — so narrowing here narrows the same set the
  // server would have.
  const filteredTraces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return traces.filter((trace) => {
      if (errorsOnly && trace.errorSpanCount === 0) return false;
      if (normalizedQuery.length === 0) return true;
      return [trace.name, trace.serviceName, trace.traceId].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [traces, query, errorsOnly]);

  return (
    <Panel>
      <PanelBar>
        <PanelSummary>
          {state.status === "ready" ? pluralize(filteredTraces.length, "trace") : "Traces"}
        </PanelSummary>

        <PanelControls>
          <SearchField
            label="Search traces"
            onValueChange={setDraft}
            placeholder="Search names, services, trace ids…"
            value={draft}
          />

          <Label className="h-9 gap-2 rounded-md border border-input bg-muted px-3 text-[11px] font-semibold text-muted-foreground">
            {/*
              Named explicitly. This renders as a button rather than a real
              checkbox input, and a wrapping label does not name a button the
              way it names a form control — without this the toggle reaches
              assistive technology as an unlabelled checkbox.
            */}
            <Checkbox
              aria-label="Errors only"
              checked={errorsOnly}
              onCheckedChange={(checked) => setFilters({ errors: checked === true || undefined })}
            />
            Errors only
          </Label>

          <RefreshButton label="Check for new traces" onRefresh={reload} refreshing={refreshing} />
        </PanelControls>
      </PanelBar>

      <div aria-live="polite">
        {state.status === "loading" && (
          <DataState
            kind="loading"
            title="Loading traces…"
            description="Fetching the newest traces from the API."
          />
        )}

        {state.status === "error" && (
          <DataState
            kind="error"
            title="Couldn't load traces"
            description={describeError(state.error, "Something went wrong while loading traces.")}
            onRetry={reload}
          />
        )}

        {state.status === "ready" && traces.length === 0 && (
          <DataState
            kind="empty"
            icon={Waypoints}
            title="No traces yet"
            description="Spans exported to this project with OTLP will show up here."
          />
        )}

        {state.status === "ready" && traces.length > 0 && filteredTraces.length === 0 && (
          <DataState
            kind="empty"
            icon={Search}
            title="No matching traces"
            description={errorsOnly ? "No trace here has a failing span." : "Try another search."}
          />
        )}

        {state.status === "ready" && filteredTraces.length > 0 && (
          <ul>
            {filteredTraces.map((trace) => (
              <li className="border-b border-border last:border-b-0" key={trace.traceId}>
                <Link
                  className="grid grid-cols-1 items-start gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-muted sm:grid-cols-[66px_minmax(0,1fr)_auto_auto_16px] sm:items-center"
                  params={{ orgSlug, projectId, traceId: trace.traceId }}
                  to="/orgs/$orgSlug/projects/$projectId/traces/$traceId"
                >
                  <SpanKindBadge className="w-full sm:w-[66px]" kind={trace.kind} />

                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{trace.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <strong className="font-bold text-foreground">{trace.serviceName}</strong>
                      <span aria-hidden="true">·</span>
                      {pluralize(trace.spanCount, "span")}
                      {trace.errorSpanCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-brand">
                            {trace.errorSpanCount} failing
                          </span>
                        </>
                      )}
                      {trace.environment != null && (
                        <>
                          <span aria-hidden="true">·</span>
                          {trace.environment}
                        </>
                      )}
                    </div>
                  </div>

                  <span className="font-mono text-[11px] whitespace-nowrap tabular-nums">
                    {formatDuration(trace.durationNanoseconds)}
                  </span>

                  <span className="flex items-center gap-1.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    <time dateTime={trace.startedAt} title={trace.startedAt}>
                      {formatRelativeTime(trace.startedAt)}
                    </time>
                  </span>

                  <ChevronRight className="hidden size-4 text-faint sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.status === "ready" && (
        <PanelFooter>
          <span>
            Showing <strong className="font-bold text-foreground">{filteredTraces.length}</strong>{" "}
            of {traces.length} traces
          </span>
          <PanelFooterNote>Sorted newest first</PanelFooterNote>
        </PanelFooter>
      )}
    </Panel>
  );
}
