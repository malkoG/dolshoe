import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api-request";
import { fetchErrorReports } from "../lib/error-reports";
import type { ErrorReportSummary } from "../lib/error-reports";
import { formatRelativeTime, formatShortId } from "../lib/format";

export const Route = createFileRoute("/projects/$projectId/reports")({ component: Reports });

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; reports: ErrorReportSummary[] };

const RUNTIME_DISPLAY_NAMES: Record<string, string> = {
  node: "Node",
  cpython: "Python",
  python: "Python",
  deno: "Deno",
  bun: "Bun",
};

function formatRuntimeLabel(runtime: ErrorReportSummary["runtime"]): string {
  const family = RUNTIME_DISPLAY_NAMES[runtime.name.toLowerCase()] ?? runtime.name;
  return runtime.version ? `${family} ${runtime.version}` : family;
}

function fileBaseName(fileName: string): string {
  const segments = fileName.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? fileName;
}

function formatSourceLocation(
  source: ErrorReportSummary["exception"]["source"],
): string | undefined {
  if (!source) return undefined;

  const place = source.fileName
    ? source.lineNumber !== undefined
      ? `${fileBaseName(source.fileName)}:${source.lineNumber}`
      : fileBaseName(source.fileName)
    : undefined;

  if (source.functionName && place) return `${source.functionName} · ${place}`;
  return source.functionName ?? place;
}

function pluralizeReports(count: number): string {
  return `${count} ${count === 1 ? "report" : "reports"}`;
}

function describeLoadError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading error reports.";
}

function Reports() {
  const { projectId } = Route.useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchErrorReports({ projectId, signal: controller.signal })
      .then((reports) => {
        if (!cancelled) setState({ status: "ready", reports });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, reloadToken]);

  const reports = state.status === "ready" ? state.reports : [];

  const environmentOptions = useMemo(() => {
    const values = new Set<string>();
    for (const report of reports) {
      if (report.service.environment) values.add(report.service.environment);
    }
    // oxlint-disable-next-line unicorn/no-array-sort -- freshly created array, not a shared reference
    return Array.from(values).sort();
  }, [reports]);

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          report.exception.type,
          report.exception.message,
          report.service.name,
          formatSourceLocation(report.exception.source),
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesEnvironment =
        environment === "all" || report.service.environment === environment;

      return matchesQuery && matchesEnvironment;
    });
  }, [reports, query, environment]);

  const hasActiveFilters = query.length > 0 || environment !== "all";

  return (
    <section className="report-panel">
      <div className="filter-bar">
        <span className="filter-summary">
          {state.status === "ready" ? pluralizeReports(filteredReports.length) : "Reports"}
        </span>

        <div className="filter-controls">
          <label className="search-field">
            <Search size={16} />
            <span className="sr-only">Search reports</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search errors, services…"
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

          <label className="select-field">
            <SlidersHorizontal size={15} />
            <span className="sr-only">Filter by environment</span>
            <select onChange={(event) => setEnvironment(event.target.value)} value={environment}>
              <option value="all">All environments</option>
              {environmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="select-chevron" size={14} />
          </label>
        </div>
      </div>

      {state.status === "ready" && reports.length > 0 && (
        <div className="list-header" aria-hidden="true">
          <span>Issue</span>
          <span>Service</span>
          <span>Occurred</span>
          <span>Report</span>
        </div>
      )}

      <div className="report-list" aria-live="polite">
        {state.status === "loading" && (
          <div className="state-panel state-panel-loading" role="status">
            <span className="state-icon">
              <Loader2 className="spin" size={19} />
            </span>
            <strong>Loading error reports…</strong>
            <p>Fetching the newest events from the API.</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="state-panel state-panel-error" role="alert">
            <span className="state-icon">
              <AlertTriangle size={19} />
            </span>
            <strong>Couldn't load error reports</strong>
            <p>{describeLoadError(state.error)}</p>
            <button onClick={() => setReloadToken((token) => token + 1)} type="button">
              <RefreshCw size={13} />
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && reports.length === 0 && (
          <div className="state-panel">
            <span className="state-icon">
              <Inbox size={19} />
            </span>
            <strong>No error reports yet</strong>
            <p>Once this project's reporters send a failure, it will show up here.</p>
          </div>
        )}

        {state.status === "ready" && reports.length > 0 && filteredReports.length === 0 && (
          <div className="state-panel">
            <span className="state-icon">
              <Search size={19} />
            </span>
            <strong>No matching reports</strong>
            <p>Try another search or clear your active filters.</p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setQuery("");
                  setEnvironment("all");
                }}
                type="button"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {state.status === "ready" &&
          filteredReports.map((report) => {
            const sourceLabel = formatSourceLocation(report.exception.source);

            return (
              <div className="report-row" key={report.id}>
                <div className="issue-copy">
                  <div className="issue-title-line">
                    <strong>{report.exception.type ?? "Unknown exception"}</strong>
                  </div>
                  {report.exception.message && <p>{report.exception.message}</p>}
                  {sourceLabel && (
                    <span className="issue-location" title={report.exception.source?.fileName}>
                      {sourceLabel}
                    </span>
                  )}
                </div>

                <div className="service-cell">
                  <strong>{report.service.name}</strong>
                  <div>
                    <span
                      className={`environment-dot environment-${report.service.environment ?? "unspecified"}`}
                      aria-hidden="true"
                    />
                    {report.service.environment ?? "Unspecified environment"}
                    <span className="meta-separator">·</span>
                    {formatRuntimeLabel(report.runtime)}
                  </div>
                </div>

                <div className="time-cell">
                  <Clock3 size={14} />
                  <time dateTime={report.occurredAt} title={report.occurredAt}>
                    {formatRelativeTime(report.occurredAt)}
                  </time>
                </div>

                <div className="report-id-cell">
                  <span title={report.id}>#{formatShortId(report.id)}</span>
                </div>
              </div>
            );
          })}
      </div>

      {state.status === "ready" && (
        <footer className="panel-footer">
          <span>
            Showing <strong>{filteredReports.length}</strong> of {reports.length} reports
          </span>
          <span className="panel-footer-note">Sorted newest first</span>
        </footer>
      )}
    </section>
  );
}
