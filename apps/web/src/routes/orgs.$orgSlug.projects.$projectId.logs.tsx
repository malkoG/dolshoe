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
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
import { createFileRoute } from "@tanstack/react-router";
import { Clock3, ScrollText, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { describeError } from "../lib/api-request";
import { formatRelativeTime, pluralize } from "../lib/format";
import { fetchLogRecords } from "../lib/log-records";
import type { LogLevel, LogRecordSummary } from "../lib/log-records";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/logs")({
  component: Logs,
});

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warning", "error", "fatal"];

/** How loudly each severity is allowed to shout. */
const LEVEL_TONES: Record<LogLevel, "neutral" | "info" | "warning" | "danger"> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  warning: "warning",
  error: "danger",
  fatal: "danger",
};

function attributeEntries(attributes: LogRecordSummary["attributes"]): Array<[string, string]> {
  if (attributes == null) return [];
  return Object.entries(attributes).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

function Logs() {
  const { orgSlug, projectId } = Route.useParams();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LogLevel | "all">("all");

  // Severity is a server-side filter because the listing is bounded: filtering
  // it in the browser would only ever narrow the newest 100 records.
  const { reload, state } = useResource(
    ({ signal }) =>
      fetchLogRecords(orgSlug, projectId, {
        ...(level === "all" ? {} : { level }),
        signal,
      }),
    [orgSlug, projectId, level],
  );

  const records = state.status === "ready" ? state.data : [];

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
    <Panel>
      <PanelBar>
        <PanelSummary>
          {state.status === "ready" ? pluralize(filteredRecords.length, "record") : "Logs"}
        </PanelSummary>

        <PanelControls>
          <SearchField
            label="Search log records"
            onValueChange={setQuery}
            placeholder="Search messages, categories…"
            value={query}
          />

          <Select onValueChange={(value) => setLevel(value as LogLevel | "all")} value={level}>
            <SelectTrigger aria-label="Filter by severity" className="w-[160px]">
              <ScrollText className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {LEVELS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PanelControls>
      </PanelBar>

      <div aria-live="polite">
        {state.status === "loading" && (
          <DataState
            kind="loading"
            title="Loading log records…"
            description="Fetching the newest records from the API."
          />
        )}

        {state.status === "error" && (
          <DataState
            kind="error"
            title="Couldn't load log records"
            description={describeError(
              state.error,
              "Something went wrong while loading log records.",
            )}
            onRetry={reload}
          />
        )}

        {state.status === "ready" && records.length === 0 && (
          <DataState
            kind="empty"
            icon={ScrollText}
            title={level === "all" ? "No log records yet" : `No ${level} records`}
            description={
              level === "all"
                ? "Structured logs sent with this project's tokens will show up here."
                : "Try a different severity."
            }
          />
        )}

        {state.status === "ready" && records.length > 0 && filteredRecords.length === 0 && (
          <DataState
            kind="empty"
            icon={Search}
            title="No matching records"
            description="Try another search."
          />
        )}

        {state.status === "ready" && filteredRecords.length > 0 && (
          <ul>
            {filteredRecords.map((record) => (
              <li
                className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-start"
                key={record.id}
              >
                <StatusBadge className="w-full sm:w-16" tone={LEVEL_TONES[record.level]}>
                  {record.level}
                </StatusBadge>

                <div className="min-w-0">
                  <p className="text-[13px] break-words">{record.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <strong className="font-bold text-foreground">{record.service.name}</strong>
                    {record.category.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <code className="font-mono text-[10px]">{record.category.join(".")}</code>
                      </>
                    )}
                    {record.service.environment && (
                      <>
                        <span aria-hidden="true">·</span>
                        {record.service.environment}
                      </>
                    )}
                  </div>
                  {attributeEntries(record.attributes).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {attributeEntries(record.attributes).map(([key, value]) => (
                        <span
                          className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border bg-muted px-2 py-1 font-mono text-[10px]"
                          key={key}
                        >
                          <span className="text-faint">{key}</span>
                          {value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <span className="flex items-center gap-1.5 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  <time dateTime={record.occurredAt} title={record.occurredAt}>
                    {formatRelativeTime(record.occurredAt)}
                  </time>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.status === "ready" && (
        <PanelFooter>
          <span>
            Showing <strong className="font-bold text-foreground">{filteredRecords.length}</strong>{" "}
            of {records.length} records
          </span>
          <PanelFooterNote>Sorted newest first</PanelFooterNote>
        </PanelFooter>
      )}
    </Panel>
  );
}
