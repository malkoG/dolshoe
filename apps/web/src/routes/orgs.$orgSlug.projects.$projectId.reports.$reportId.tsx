import { Button } from "@dolshoe/ui/components/ui/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { describeError } from "../lib/api-request";
import { fetchErrorReport } from "../lib/error-reports";
import { formatShortId } from "../lib/format";
import { useResource } from "../lib/use-resource";
import { ReportDetailPanel } from "../screens/report-detail/report-detail";
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
  staticData: {
    breadcrumb: ({ params }) => `Report ${formatShortId(params.reportId ?? "")}`,
  },
  component: Report,
});

function Report() {
  const { orgSlug, projectId, reportId } = Route.useParams();
  const search = Route.useSearch();

  const { reload, state } = useResource(
    ({ signal }) => fetchErrorReport(orgSlug, projectId, reportId, { signal }),
    [orgSlug, projectId, reportId],
  );

  const report = state.status === "ready" ? state.data : undefined;

  return (
    <ReportDetailPanel
      back={
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
      }
      errorDescription={
        state.status === "error"
          ? describeError(state.error, "Something went wrong while loading it.")
          : undefined
      }
      onRetry={reload}
      report={report}
      status={state.status}
      trace={
        report?.trace == null
          ? undefined
          : {
              href: `/orgs/${orgSlug}/projects/${projectId}/traces/${report.trace.traceId}`,
              label: `trace ${formatShortId(report.trace.traceId)}`,
            }
      }
    />
  );
}
