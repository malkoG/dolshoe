import { DataState } from "@dolshoe/ui/components/data-state";
import { Panel, PanelBar, PanelControls, PanelFooter } from "@dolshoe/ui/components/panel";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Clock3 } from "lucide-react";

import { ExceptionTree } from "../components/exception-tree";
import { describeError } from "../lib/api-request";
import { fetchErrorReport } from "../lib/error-reports";
import { formatRelativeTime, formatShortId } from "../lib/format";
import { useResource } from "../lib/use-resource";
import { validateReportFilters } from "./orgs.$orgSlug.projects.$projectId.reports.index";

/**
 * The list's filters are declared here too, though nothing on this screen reads
 * them. They arrived in the URL that opened this report, and declaring them is
 * what lets the way back out hand them straight back — so a reader who searched
 * for one exception among four hundred returns to those results rather than to
 * the four hundred.
 */
export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/reports/$reportId")({
  validateSearch: validateReportFilters,
  component: Report,
});

const RUNTIME_DISPLAY_NAMES: Record<string, string> = {
  node: "Node",
  cpython: "Python",
  python: "Python",
  deno: "Deno",
  bun: "Bun",
};

function Report() {
  const { orgSlug, projectId, reportId } = Route.useParams();
  const search = Route.useSearch();

  const { reload, state } = useResource(
    ({ signal }) => fetchErrorReport(orgSlug, projectId, reportId, { signal }),
    [orgSlug, projectId, reportId],
  );

  const report = state.status === "ready" ? state.data : undefined;
  const runtimeFamily =
    report == null
      ? undefined
      : (RUNTIME_DISPLAY_NAMES[report.runtime.name.toLowerCase()] ?? report.runtime.name);

  return (
    <Panel>
      <PanelBar>
        <Button asChild size="sm" variant="ghost">
          <Link
            params={{ orgSlug, projectId }}
            search={search}
            to="/orgs/$orgSlug/projects/$projectId/reports"
          >
            <ArrowLeft />
            {search.q == null && search.env == null ? "All reports" : "Back to results"}
          </Link>
        </Button>

        {report != null && (
          <PanelControls className="gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-bold text-foreground">{report.service.name}</span>
            {report.service.environment != null && (
              <StatusBadge>{report.service.environment}</StatusBadge>
            )}
            <span aria-hidden="true">·</span>
            {runtimeFamily}
            {report.runtime.version != null && ` ${report.runtime.version}`}
            <span className="flex items-center gap-1.5 font-mono text-[10px]">
              <Clock3 className="size-3.5" />
              <time dateTime={report.occurredAt} title={report.occurredAt}>
                {formatRelativeTime(report.occurredAt)}
              </time>
            </span>
          </PanelControls>
        )}
      </PanelBar>

      <div aria-live="polite">
        {state.status === "loading" && (
          <DataState
            kind="loading"
            title="Loading the report…"
            description="Fetching the stored exception and its frames."
          />
        )}

        {state.status === "error" && (
          <DataState
            kind="error"
            title="Couldn't load this report"
            description={describeError(state.error, "Something went wrong while loading it.")}
            onRetry={reload}
          />
        )}

        {report != null && <ExceptionTree exception={report.exception} />}
      </div>

      {report != null && (
        <PanelFooter>
          <span className="flex flex-wrap items-center gap-1.5">
            Reported by{" "}
            <strong className="font-bold text-foreground">{report.reporter.name}</strong>
            {report.mechanism != null && (
              <>
                <span aria-hidden="true">·</span>
                <code className="font-mono text-[10px]">{report.mechanism.type}</code>
                {report.mechanism.handled === false && " (unhandled)"}
              </>
            )}
            {report.trace != null && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  className="font-mono text-[10px] underline-offset-4 hover:underline"
                  params={{ orgSlug, projectId, traceId: report.trace.traceId }}
                  to="/orgs/$orgSlug/projects/$projectId/traces/$traceId"
                >
                  trace {formatShortId(report.trace.traceId)}
                </Link>
              </>
            )}
          </span>
          <span className="font-mono text-[10px] text-faint" title={report.id}>
            #{formatShortId(report.id)}
          </span>
        </PanelFooter>
      )}
    </Panel>
  );
}
