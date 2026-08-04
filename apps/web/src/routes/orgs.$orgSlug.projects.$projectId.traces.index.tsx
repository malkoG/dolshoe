import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  Waypoints,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api-request";
import { formatDuration, formatRelativeTime } from "../lib/format";
import { fetchTraces } from "../lib/traces";
import type { TraceSummary } from "../lib/traces";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/traces/")({
  component: Traces,
});

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; traces: TraceSummary[] };

function describeLoadError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading traces.";
}

function pluralizeTraces(count: number): string {
  return `${count} ${count === 1 ? "trace" : "traces"}`;
}

function Traces() {
  const { orgSlug, projectId } = Route.useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchTraces(orgSlug, projectId, { signal: controller.signal })
      .then((traces) => {
        if (!cancelled) setState({ status: "ready", traces });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [orgSlug, projectId, reloadToken]);

  const traces = state.status === "ready" ? state.traces : [];

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
    <section className="report-panel">
      <div className="filter-bar">
        <span className="filter-summary">
          {state.status === "ready" ? pluralizeTraces(filteredTraces.length) : "Traces"}
        </span>

        <div className="filter-controls">
          <label className="search-field">
            <Search size={16} />
            <span className="sr-only">Search traces</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search names, services, trace ids…"
              type="search"
              value={query}
            />
            {query.length > 0 && (
              <button
                className="clear-search"
                onClick={() => setQuery("")}
                type="button"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </label>

          <label className="toggle-field">
            <input
              checked={errorsOnly}
              onChange={(event) => setErrorsOnly(event.target.checked)}
              type="checkbox"
            />
            Errors only
          </label>
        </div>
      </div>

      <div className="report-list" aria-live="polite">
        {state.status === "loading" && (
          <div className="state-panel state-panel-loading" role="status">
            <span className="state-icon">
              <Loader2 className="spin" size={19} />
            </span>
            <strong>Loading traces…</strong>
            <p>Fetching the newest traces from the API.</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="state-panel state-panel-error" role="alert">
            <span className="state-icon">
              <AlertTriangle size={19} />
            </span>
            <strong>Couldn't load traces</strong>
            <p>{describeLoadError(state.error)}</p>
            <button onClick={() => setReloadToken((token) => token + 1)} type="button">
              <RefreshCw size={13} />
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && traces.length === 0 && (
          <div className="state-panel">
            <span className="state-icon">
              <Waypoints size={19} />
            </span>
            <strong>No traces yet</strong>
            <p>Spans exported to this project with OTLP will show up here.</p>
          </div>
        )}

        {state.status === "ready" && traces.length > 0 && filteredTraces.length === 0 && (
          <div className="state-panel">
            <span className="state-icon">
              <Search size={19} />
            </span>
            <strong>No matching traces</strong>
            <p>{errorsOnly ? "No trace here has a failing span." : "Try another search."}</p>
          </div>
        )}

        {state.status === "ready" &&
          filteredTraces.map((trace) => (
            <Link
              className="trace-row"
              key={trace.traceId}
              params={{ orgSlug, projectId, traceId: trace.traceId }}
              to="/orgs/$orgSlug/projects/$projectId/traces/$traceId"
            >
              <span className={`span-kind span-kind-${trace.kind}`}>{trace.kind}</span>

              <div className="trace-copy">
                <p className="trace-name">{trace.name}</p>
                <div className="log-meta">
                  <strong>{trace.serviceName}</strong>
                  <span className="meta-separator">·</span>
                  {trace.spanCount} {trace.spanCount === 1 ? "span" : "spans"}
                  {trace.errorSpanCount > 0 && (
                    <>
                      <span className="meta-separator">·</span>
                      <span className="trace-errors">{trace.errorSpanCount} failing</span>
                    </>
                  )}
                  {trace.environment != null && (
                    <>
                      <span className="meta-separator">·</span>
                      {trace.environment}
                    </>
                  )}
                </div>
              </div>

              <span className="span-duration">{formatDuration(trace.durationNanoseconds)}</span>

              <div className="time-cell">
                <Clock3 size={14} />
                <time dateTime={trace.startedAt} title={trace.startedAt}>
                  {formatRelativeTime(trace.startedAt)}
                </time>
              </div>

              <ChevronRight className="trace-chevron" size={16} />
            </Link>
          ))}
      </div>

      {state.status === "ready" && (
        <footer className="panel-footer">
          <span>
            Showing <strong>{filteredTraces.length}</strong> of {traces.length} traces
          </span>
          <span className="panel-footer-note">Sorted newest first</span>
        </footer>
      )}
    </section>
  );
}
