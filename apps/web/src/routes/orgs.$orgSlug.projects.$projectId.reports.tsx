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
import { StatusDot } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dolshoe/ui/components/ui/table";
import { createFileRoute } from "@tanstack/react-router";
import { Clock3, Inbox, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { describeError } from "../lib/api-request";
import { fetchErrorReports } from "../lib/error-reports";
import type { ErrorReportSummary } from "../lib/error-reports";
import { formatRelativeTime, formatShortId, pluralize } from "../lib/format";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/reports")({
  component: Reports,
});

const RUNTIME_DISPLAY_NAMES: Record<string, string> = {
  node: "Node",
  cpython: "Python",
  python: "Python",
  deno: "Deno",
  bun: "Bun",
};

/** Which environments get a colour of their own, and which stay deliberately grey. */
const ENVIRONMENT_TONES: Record<string, "success" | "violet"> = {
  production: "success",
  staging: "violet",
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

function Reports() {
  const { orgSlug, projectId } = Route.useParams();
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("all");

  const { reload, state } = useResource(
    ({ signal }) => fetchErrorReports(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  const reports = state.status === "ready" ? state.data : [];

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
    <Panel>
      <PanelBar>
        <PanelSummary>
          {state.status === "ready" ? pluralize(filteredReports.length, "report") : "Reports"}
        </PanelSummary>

        <PanelControls>
          <SearchField
            label="Search reports"
            onValueChange={setQuery}
            placeholder="Search errors, services…"
            value={query}
          />

          <Select onValueChange={setEnvironment} value={environment}>
            <SelectTrigger aria-label="Filter by environment" className="w-[190px]">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All environments</SelectItem>
              {environmentOptions.map((option) => (
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
            title="Loading error reports…"
            description="Fetching the newest events from the API."
          />
        )}

        {state.status === "error" && (
          <DataState
            kind="error"
            title="Couldn't load error reports"
            description={describeError(
              state.error,
              "Something went wrong while loading error reports.",
            )}
            onRetry={reload}
          />
        )}

        {state.status === "ready" && reports.length === 0 && (
          <DataState
            kind="empty"
            icon={Inbox}
            title="No error reports yet"
            description="Once this project's reporters send a failure, it will show up here."
          />
        )}

        {state.status === "ready" && reports.length > 0 && filteredReports.length === 0 && (
          <DataState
            kind="empty"
            icon={Search}
            title="No matching reports"
            description="Try another search or clear your active filters."
            action={
              hasActiveFilters && (
                <Button
                  onClick={() => {
                    setQuery("");
                    setEnvironment("all");
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Clear all filters
                </Button>
              )
            }
          />
        )}

        {/*
          The table's layout is fixed, not automatic. The issue column holds the
          longest text on the page and would otherwise be the one the browser
          squeezes, clipping an exception message mid-word while the service
          column sits half empty. Fixing the layout lets the narrow columns claim
          what they need and hands everything left over to the issue.
        */}
        {state.status === "ready" && filteredReports.length > 0 && (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-border bg-muted hover:bg-muted">
                <TableHead className="h-9 px-5 font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
                  Issue
                </TableHead>
                <TableHead className="hidden h-9 font-mono text-[9px] tracking-[0.08em] text-faint uppercase md:table-cell md:w-[230px] lg:w-[260px]">
                  Service
                </TableHead>
                <TableHead className="hidden h-9 font-mono text-[9px] tracking-[0.08em] text-faint uppercase lg:table-cell lg:w-[130px]">
                  Occurred
                </TableHead>
                <TableHead className="hidden h-9 pr-5 font-mono text-[9px] tracking-[0.08em] text-faint uppercase lg:table-cell lg:w-[100px]">
                  Report
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => {
                const sourceLabel = formatSourceLocation(report.exception.source);
                const environmentName = report.service.environment;

                return (
                  <TableRow className="border-border" key={report.id}>
                    <TableCell className="px-5 py-4 align-top">
                      <strong className="block truncate text-[13px] font-bold">
                        {report.exception.type ?? "Unknown exception"}
                      </strong>
                      {report.exception.message && (
                        <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                          {report.exception.message}
                        </p>
                      )}
                      {sourceLabel && (
                        <span
                          className="mt-1.5 block truncate font-mono text-[10px] text-faint"
                          title={report.exception.source?.fileName}
                        >
                          {sourceLabel}
                        </span>
                      )}

                      {/*
                        Below the widest breakpoint the other three columns are
                        gone, so what they carried is restated here rather than
                        simply lost.
                      */}
                      <span className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground md:hidden">
                        <strong className="font-sans text-[11px] font-bold text-foreground">
                          {report.service.name}
                        </strong>
                        <StatusDot
                          tone={
                            environmentName == null
                              ? "neutral"
                              : (ENVIRONMENT_TONES[environmentName] ?? "neutral")
                          }
                        />
                        {environmentName ?? "Unspecified environment"}
                        <span aria-hidden="true">·</span>
                        <time dateTime={report.occurredAt}>
                          {formatRelativeTime(report.occurredAt)}
                        </time>
                      </span>
                    </TableCell>

                    <TableCell className="hidden py-4 align-top md:table-cell">
                      <strong className="block truncate text-[11px] font-bold">
                        {report.service.name}
                      </strong>
                      <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        <StatusDot
                          tone={
                            environmentName == null
                              ? "neutral"
                              : (ENVIRONMENT_TONES[environmentName] ?? "neutral")
                          }
                        />
                        <span className="truncate">
                          {environmentName ?? "Unspecified environment"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{formatRuntimeLabel(report.runtime)}</span>
                      </div>
                    </TableCell>

                    <TableCell className="hidden py-4 align-top whitespace-nowrap lg:table-cell">
                      <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        <Clock3 className="size-3.5" />
                        <time dateTime={report.occurredAt} title={report.occurredAt}>
                          {formatRelativeTime(report.occurredAt)}
                        </time>
                      </span>
                    </TableCell>

                    <TableCell className="hidden py-4 pr-5 align-top lg:table-cell">
                      <span className="font-mono text-[10px] text-faint" title={report.id}>
                        #{formatShortId(report.id)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {state.status === "ready" && (
        <PanelFooter>
          <span>
            Showing <strong className="font-bold text-foreground">{filteredReports.length}</strong>{" "}
            of {reports.length} reports
          </span>
          <PanelFooterNote>Sorted newest first</PanelFooterNote>
        </PanelFooter>
      )}
    </Panel>
  );
}
