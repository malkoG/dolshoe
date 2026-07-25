import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Command,
  LifeBuoy,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({ component: Home });

type ReportStatus = "new" | "ongoing" | "resolved";
type FilterStatus = "all" | ReportStatus;

type ErrorReport = {
  id: string;
  status: ReportStatus;
  exceptionType: string;
  message: string;
  service: string;
  environment: "production" | "staging";
  runtime: string;
  location: string;
  occurredAt: string;
  relativeTime: string;
  occurrences: number;
};

const reports: ErrorReport[] = [
  {
    id: "DSH-1842",
    status: "new",
    exceptionType: "TypeError",
    message: "Cannot read properties of undefined (reading 'items')",
    service: "checkout-api",
    environment: "production",
    runtime: "Node 24.4",
    location: "submitOrder · order.ts:42",
    occurredAt: "2026-07-25T09:42:00+09:00",
    relativeTime: "2 min ago",
    occurrences: 48,
  },
  {
    id: "DSH-1841",
    status: "ongoing",
    exceptionType: "TimeoutError",
    message: "Payment provider did not respond within 10s",
    service: "billing-worker",
    environment: "production",
    runtime: "Python 3.14",
    location: "settle_invoice · settle.py:73",
    occurredAt: "2026-07-25T09:37:00+09:00",
    relativeTime: "7 min ago",
    occurrences: 326,
  },
  {
    id: "DSH-1839",
    status: "ongoing",
    exceptionType: "PostgresError",
    message: "Deadlock detected while updating inventory",
    service: "inventory-api",
    environment: "production",
    runtime: "Node 24.4",
    location: "reserveStock · inventory.ts:118",
    occurredAt: "2026-07-25T09:26:00+09:00",
    relativeTime: "18 min ago",
    occurrences: 17,
  },
  {
    id: "DSH-1838",
    status: "new",
    exceptionType: "ConnectionResetError",
    message: "Socket closed before TLS handshake completed",
    service: "webhook-gateway",
    environment: "staging",
    runtime: "Deno 2.4",
    location: "deliverWebhook · delivery.ts:91",
    occurredAt: "2026-07-25T09:13:00+09:00",
    relativeTime: "31 min ago",
    occurrences: 4,
  },
  {
    id: "DSH-1835",
    status: "resolved",
    exceptionType: "ValidationError",
    message: "Currency code must be a valid ISO 4217 value",
    service: "checkout-api",
    environment: "production",
    runtime: "Node 24.4",
    location: "validateCart · validation.ts:29",
    occurredAt: "2026-07-25T08:28:00+09:00",
    relativeTime: "1 hr ago",
    occurrences: 82,
  },
  {
    id: "DSH-1833",
    status: "ongoing",
    exceptionType: "MemoryError",
    message: "Worker exceeded the 512 MB memory limit",
    service: "billing-worker",
    environment: "production",
    runtime: "Python 3.14",
    location: "render_statement · statement.py:204",
    occurredAt: "2026-07-25T07:51:00+09:00",
    relativeTime: "2 hr ago",
    occurrences: 9,
  },
  {
    id: "DSH-1828",
    status: "resolved",
    exceptionType: "AbortError",
    message: "Request was aborted while fetching tax rates",
    service: "checkout-api",
    environment: "staging",
    runtime: "Bun 1.3",
    location: "getTaxRate · tax.ts:64",
    occurredAt: "2026-07-25T06:44:00+09:00",
    relativeTime: "3 hr ago",
    occurrences: 12,
  },
];

const statusOptions: Array<{ label: string; value: FilterStatus }> = [
  { label: "All reports", value: "all" },
  { label: "New", value: "new" },
  { label: "Ongoing", value: "ongoing" },
  { label: "Resolved", value: "resolved" },
];

function Home() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [environment, setEnvironment] = useState("all");

  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [report.exceptionType, report.message, report.service, report.location, report.id].some(
          (value) => value.toLowerCase().includes(normalizedQuery),
        );
      const matchesStatus = status === "all" || report.status === status;
      const matchesEnvironment = environment === "all" || report.environment === environment;

      return matchesQuery && matchesStatus && matchesEnvironment;
    });
  }, [environment, query, status]);

  const hasActiveFilters = query.length > 0 || status !== "all" || environment !== "all";

  function resetFilters() {
    setQuery("");
    setStatus("all");
    setEnvironment("all");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Dolshoe home">
          <span className="brand-mark" aria-hidden="true">
            D
          </span>
          <span>dolshoe</span>
        </a>

        <nav className="topnav" aria-label="Primary navigation">
          <a className="nav-link nav-link-active" href="/" aria-current="page">
            <CircleAlert size={16} />
            Reports
          </a>
          <a className="nav-link" href="#services">
            <Boxes size={16} />
            Services
          </a>
          <a className="nav-link" href="#activity">
            <Activity size={16} />
            Activity
          </a>
        </nav>

        <div className="topbar-actions">
          <button className="icon-button" type="button" aria-label="Open command menu">
            <Command size={17} />
          </button>
          <button
            className="icon-button notification-button"
            type="button"
            aria-label="Notifications"
          >
            <Bell size={17} />
            <span className="notification-dot" />
          </button>
          <button className="avatar" type="button" aria-label="Open account menu">
            KW
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="live-dot" />
              Live error stream
            </div>
            <h1>Error reports</h1>
            <p>Investigate failures across every service from one focused inbox.</p>
          </div>
          <button className="help-button" type="button">
            <LifeBuoy size={16} />
            Set up a reporter
          </button>
        </section>

        <section className="metrics" aria-label="Error report summary">
          <article className="metric metric-critical">
            <div className="metric-label">
              Open issues
              <CircleAlert size={15} />
            </div>
            <div className="metric-value-row">
              <strong>28</strong>
              <span className="metric-trend metric-trend-bad">+6 today</span>
            </div>
          </article>
          <article className="metric">
            <div className="metric-label">
              Events today
              <Sparkles size={15} />
            </div>
            <div className="metric-value-row">
              <strong>1,284</strong>
              <span className="metric-trend">12.4% vs. yesterday</span>
            </div>
          </article>
          <article className="metric">
            <div className="metric-label">
              Unhandled
              <Activity size={15} />
            </div>
            <div className="metric-value-row">
              <strong>91.8%</strong>
              <span className="metric-trend">1,179 events</span>
            </div>
          </article>
          <article className="metric">
            <div className="metric-label">
              Affected services
              <Boxes size={15} />
            </div>
            <div className="metric-value-row">
              <strong>4</strong>
              <span className="metric-trend">of 7 monitored</span>
            </div>
          </article>
        </section>

        <section className="report-panel">
          <div className="filter-bar">
            <div className="status-tabs" aria-label="Filter reports by status">
              {statusOptions.map((option) => (
                <button
                  className={
                    status === option.value ? "status-tab status-tab-active" : "status-tab"
                  }
                  key={option.value}
                  onClick={() => setStatus(option.value)}
                  type="button"
                >
                  {option.label}
                  {option.value === "new" && <span className="new-count">2</span>}
                </button>
              ))}
            </div>

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
                <select
                  onChange={(event) => setEnvironment(event.target.value)}
                  value={environment}
                >
                  <option value="all">All environments</option>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                </select>
                <ChevronDown className="select-chevron" size={14} />
              </label>
            </div>
          </div>

          <div className="list-header" aria-hidden="true">
            <span>Issue</span>
            <span>Service</span>
            <span>Last seen</span>
            <span>Events</span>
            <span />
          </div>

          <div className="report-list" aria-live="polite">
            {filteredReports.map((report) => (
              <a className="report-row" href={`#${report.id}`} key={report.id}>
                <div className="issue-cell">
                  <span className={`status-indicator status-${report.status}`} />
                  <div className="issue-copy">
                    <div className="issue-title-line">
                      <strong>{report.exceptionType}</strong>
                      <span className={`status-chip status-chip-${report.status}`}>
                        {report.status}
                      </span>
                    </div>
                    <p>{report.message}</p>
                    <span className="issue-location">{report.location}</span>
                  </div>
                </div>

                <div className="service-cell">
                  <strong>{report.service}</strong>
                  <div>
                    <span
                      className={`environment-dot environment-${report.environment}`}
                      aria-hidden="true"
                    />
                    {report.environment}
                    <span className="meta-separator">·</span>
                    {report.runtime}
                  </div>
                </div>

                <div className="time-cell">
                  <Clock3 size={14} />
                  <time dateTime={report.occurredAt}>{report.relativeTime}</time>
                </div>

                <div className="events-cell">
                  <strong>{report.occurrences.toLocaleString()}</strong>
                  <span>{report.id}</span>
                </div>

                <ChevronRight className="row-arrow" size={18} />
              </a>
            ))}

            {filteredReports.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">
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
          </div>

          <footer className="panel-footer">
            <span>
              Showing <strong>{filteredReports.length}</strong> of {reports.length} reports
            </span>
            <div className="sync-status">
              <span />
              Updated just now
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
