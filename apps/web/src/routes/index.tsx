import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  CircleAlert,
  Clock3,
  Inbox,
  LifeBuoy,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageShell } from "../components/page-shell";
import { ErrorReportsFetchError, fetchErrorReports } from "../lib/error-reports";
import type { ErrorReportSummary } from "../lib/error-reports";
import { fetchProjects } from "../lib/projects";
import type { Project } from "../lib/projects";

export const Route = createFileRoute("/")({ component: Home });

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

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const RELATIVE_TIME_DIVISIONS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

function formatRelativeTime(isoTimestamp: string): string {
  let duration = (new Date(isoTimestamp).getTime() - Date.now()) / 1000;

  for (const [unit, amount] of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return relativeTimeFormatter.format(Math.round(duration), unit);
    }
    duration /= amount;
  }

  return relativeTimeFormatter.format(Math.round(duration), "year");
}

function formatShortId(id: string): string {
  return id.slice(0, 8);
}

function pluralizeReports(count: number): string {
  return `${count} ${count === 1 ? "report" : "reports"}`;
}

function describeLoadError(error: unknown): string {
  if (error instanceof ErrorReportsFetchError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading error reports.";
}

function Home() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchErrorReports({
      ...(projectId === "all" ? {} : { projectId }),
      signal: controller.signal,
    })
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
  }, [reloadToken, projectId]);

  // The project list only labels the filter, so a failure here leaves the inbox
  // usable with an "All projects" selector rather than blocking it.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetchProjects({ signal: controller.signal })
      .then((loaded) => {
        if (!cancelled) setProjects(loaded);
        return;
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

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

  const metrics = useMemo(() => {
    if (state.status !== "ready") return null;

    const today = new Date().toDateString();
    return {
      total: reports.length,
      services: new Set(reports.map((report) => report.service.name)).size,
      occurredToday: reports.filter(
        (report) => new Date(report.occurredAt).toDateString() === today,
      ).length,
    };
  }, [state.status, reports]);

  const hasActiveFilters = query.length > 0 || environment !== "all" || projectId !== "all";

  function resetFilters() {
    setQuery("");
    setEnvironment("all");
    setProjectId("all");
  }

  function retry() {
    setReloadToken((token) => token + 1);
  }

  return (
    <PageShell active="reports">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" aria-hidden="true" />
            Newest reports first
          </div>
          <h1>Error reports</h1>
          <p>Investigate failures across every service from one focused inbox.</p>
        </div>
        <button className="help-button" type="button">
          <LifeBuoy size={16} />
          Set up a reporter
        </button>
      </section>

      {metrics && (
        <section className="metrics" aria-label="Error report summary">
          <article className="metric metric-critical">
            <div className="metric-label">
              Reports loaded
              <CircleAlert size={15} />
            </div>
            <div className="metric-value-row">
              <strong>{metrics.total.toLocaleString()}</strong>
            </div>
          </article>
          <article className="metric">
            <div className="metric-label">
              Events today
              <Sparkles size={15} />
            </div>
            <div className="metric-value-row">
              <strong>{metrics.occurredToday.toLocaleString()}</strong>
            </div>
          </article>
          <article className="metric">
            <div className="metric-label">
              Affected services
              <Boxes size={15} />
            </div>
            <div className="metric-value-row">
              <strong>{metrics.services.toLocaleString()}</strong>
            </div>
          </article>
        </section>
      )}

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
              <Boxes size={15} />
              <span className="sr-only">Filter by project</span>
              <select onChange={(event) => setProjectId(event.target.value)} value={projectId}>
                <option value="all">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="select-chevron" size={14} />
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
              <button onClick={retry} type="button">
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
              <p>Once a connected service reports a failure, it will show up here.</p>
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
                <button onClick={resetFilters} type="button">
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
                    <strong>
                      {report.service.name}
                      {projectId === "all" && (
                        <span className="project-chip" title={report.project.name}>
                          {report.project.slug}
                        </span>
                      )}
                    </strong>
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
    </PageShell>
  );
}
