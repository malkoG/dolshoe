import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  Loader2,
  RefreshCw,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatRelativeTime } from "../lib/format";
import { LogRecordsFetchError, fetchLogRecords } from "../lib/log-records";
import type { LogLevel, LogRecordSummary } from "../lib/log-records";

export const Route = createFileRoute("/projects/$projectId/logs")({ component: Logs });

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; records: LogRecordSummary[] };

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warning", "error", "fatal"];

function describeLoadError(error: unknown): string {
  if (error instanceof LogRecordsFetchError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading log records.";
}

function pluralizeRecords(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

function attributeEntries(attributes: LogRecordSummary["attributes"]): Array<[string, string]> {
  if (attributes == null) return [];
  return Object.entries(attributes).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

function Logs() {
  const { projectId } = Route.useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LogLevel | "all">("all");

  // Severity is a server-side filter because the listing is bounded: filtering
  // it in the browser would only ever narrow the newest 100 records.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchLogRecords({
      projectId,
      ...(level === "all" ? {} : { level }),
      signal: controller.signal,
    })
      .then((records) => {
        if (!cancelled) setState({ status: "ready", records });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, level, reloadToken]);

  const records = state.status === "ready" ? state.records : [];

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return records;

    return records.filter((record) =>
      [record.message, record.service.name, record.category.join(".")].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [records, query]);

  return (
    <section className="report-panel">
      <div className="filter-bar">
        <span className="filter-summary">
          {state.status === "ready" ? pluralizeRecords(filteredRecords.length) : "Logs"}
        </span>

        <div className="filter-controls">
          <label className="search-field">
            <Search size={16} />
            <span className="sr-only">Search log records</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages, categories…"
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
            <ScrollText size={15} />
            <span className="sr-only">Filter by severity</span>
            <select
              onChange={(event) => setLevel(event.target.value as LogLevel | "all")}
              value={level}
            >
              <option value="all">All levels</option>
              {LEVELS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="select-chevron" size={14} />
          </label>
        </div>
      </div>

      <div className="report-list" aria-live="polite">
        {state.status === "loading" && (
          <div className="state-panel state-panel-loading" role="status">
            <span className="state-icon">
              <Loader2 className="spin" size={19} />
            </span>
            <strong>Loading log records…</strong>
            <p>Fetching the newest records from the API.</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="state-panel state-panel-error" role="alert">
            <span className="state-icon">
              <AlertTriangle size={19} />
            </span>
            <strong>Couldn't load log records</strong>
            <p>{describeLoadError(state.error)}</p>
            <button onClick={() => setReloadToken((token) => token + 1)} type="button">
              <RefreshCw size={13} />
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && records.length === 0 && (
          <div className="state-panel">
            <span className="state-icon">
              <ScrollText size={19} />
            </span>
            <strong>{level === "all" ? "No log records yet" : `No ${level} records`}</strong>
            <p>
              {level === "all"
                ? "Structured logs sent with this project's tokens will show up here."
                : "Try a different severity."}
            </p>
          </div>
        )}

        {state.status === "ready" && records.length > 0 && filteredRecords.length === 0 && (
          <div className="state-panel">
            <span className="state-icon">
              <Search size={19} />
            </span>
            <strong>No matching records</strong>
            <p>Try another search.</p>
          </div>
        )}

        {state.status === "ready" &&
          filteredRecords.map((record) => (
            <div className="log-row" key={record.id}>
              <span className={`log-level log-level-${record.level}`}>{record.level}</span>

              <div className="log-copy">
                <p className="log-message">{record.message}</p>
                <div className="log-meta">
                  <strong>{record.service.name}</strong>
                  {record.category.length > 0 && (
                    <>
                      <span className="meta-separator">·</span>
                      <code>{record.category.join(".")}</code>
                    </>
                  )}
                  {record.service.environment && (
                    <>
                      <span className="meta-separator">·</span>
                      {record.service.environment}
                    </>
                  )}
                </div>
                {attributeEntries(record.attributes).length > 0 && (
                  <div className="log-attributes">
                    {attributeEntries(record.attributes).map(([key, value]) => (
                      <span className="log-attribute" key={key}>
                        <span className="log-attribute-key">{key}</span>
                        {value}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="time-cell">
                <Clock3 size={14} />
                <time dateTime={record.occurredAt} title={record.occurredAt}>
                  {formatRelativeTime(record.occurredAt)}
                </time>
              </div>
            </div>
          ))}
      </div>

      {state.status === "ready" && (
        <footer className="panel-footer">
          <span>
            Showing <strong>{filteredRecords.length}</strong> of {records.length} records
          </span>
          <span className="panel-footer-note">Sorted newest first</span>
        </footer>
      )}
    </section>
  );
}
