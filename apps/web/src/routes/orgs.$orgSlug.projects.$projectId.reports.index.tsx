import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { describeError } from "../lib/api-request";
import { fetchErrorReports } from "../lib/error-reports";
import { textParam } from "../lib/list-filters";
import { fetchProjectTokens } from "../lib/projects";
import { useResource } from "../lib/use-resource";
import { useUrlTextFilter } from "../lib/use-url-text-filter";
import { REPORTS_SETUP_SNIPPET } from "../screens/reports/reports-setup";
import { ReportsView } from "../screens/reports/reports-view";
import type { ReportsViewStatus } from "../screens/reports/reports-view";
import { formatSourceLocation, reportHref, toReportRow } from "../screens/reports/to-report-row";

/**
 * What a reader narrowed the list to, kept in the URL rather than in this
 * component. Exported because the report screen carries the same values through
 * untouched, which is what lets its way back out restore the list exactly as it
 * was left.
 */
export interface ReportFilters {
  q?: string;
  env?: string;
  tagKey?: string;
  tagValue?: string;
  userId?: string;
}

export function validateReportFilters(search: Record<string, unknown>): ReportFilters {
  return {
    q: textParam(search.q),
    env: textParam(search.env),
    tagKey: textParam(search.tagKey),
    tagValue: textParam(search.tagValue),
    userId: textParam(search.userId),
  };
}

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/reports/")({
  validateSearch: validateReportFilters,
  staticData: { breadcrumb: "Reports" },
  component: Reports,
});

/** How often a project with nothing in it looks again for its first event. */
const CHECK_INTERVAL_MS = 5_000;

function Reports() {
  const { orgSlug, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const environment = search.env ?? "all";

  // `replace` rather than a new history entry: typing six characters into the
  // search field should leave one thing behind the back button, and that thing
  // should be the screen this reader came from.
  function setFilters(next: ReportFilters): void {
    void navigate({ replace: true, search: (previous) => ({ ...previous, ...next }) });
  }

  const { draft, setDraft } = useUrlTextFilter(query, (q) => setFilters({ q }));

  // Server-side filters, unlike `q`/`env` above: the list is bounded, so
  // narrowing an already-loaded page in the browser would only ever narrow
  // whichever page happened to load — the same reasoning the logs screen's
  // `level` filter already follows.
  const { draft: tagKeyDraft, setDraft: setTagKeyDraft } = useUrlTextFilter(
    search.tagKey ?? "",
    (tagKey) => setFilters({ tagKey }),
  );
  const { draft: tagValueDraft, setDraft: setTagValueDraft } = useUrlTextFilter(
    search.tagValue ?? "",
    (tagValue) => setFilters({ tagValue }),
  );
  const { draft: userIdDraft, setDraft: setUserIdDraft } = useUrlTextFilter(
    search.userId ?? "",
    (userId) => setFilters({ userId }),
  );

  const { refreshing, reload, state } = useResource(
    ({ signal }) =>
      fetchErrorReports(orgSlug, projectId, {
        tagKey: search.tagKey,
        tagValue: search.tagValue,
        userId: search.userId,
        signal,
      }),
    [orgSlug, projectId, search.tagKey, search.tagValue, search.userId],
  );

  const reports = state.status === "ready" ? state.data : [];

  const hasServerFilters =
    search.tagKey != null || search.tagValue != null || search.userId != null;
  const hasActiveFilters = query.length > 0 || environment !== "all" || hasServerFilters;
  const awaitingFirstReport = state.status === "ready" && reports.length === 0 && !hasServerFilters;

  const { state: tokenState } = useResource(
    ({ signal }) =>
      awaitingFirstReport
        ? fetchProjectTokens(orgSlug, projectId, { signal })
        : Promise.resolve([]),
    [orgSlug, projectId, awaitingFirstReport],
  );

  useEffect(() => {
    if (!awaitingFirstReport) return;

    const timer = setInterval(() => {
      // A tab nobody is looking at is not waiting for anything, and polling it
      // spends an operator's database on a screen that is not on screen.
      if (document.visibilityState === "hidden") return;
      reload();
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [awaitingFirstReport, reload]);

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

  const status = viewStatus(state.status, {
    awaitingFirstReport,
    filteredCount: filteredReports.length,
  });

  const liveTokens =
    tokenState.status === "ready"
      ? tokenState.data.filter((token) => token.revokedAt == null).length
      : 0;

  return (
    <ReportsView
      environment={environment}
      environmentOptions={environmentOptions}
      errorDescription={
        state.status === "error"
          ? describeError(state.error, "Something went wrong while loading error reports.")
          : undefined
      }
      onClearFilters={
        hasActiveFilters
          ? () =>
              setFilters({
                env: undefined,
                q: undefined,
                tagKey: undefined,
                tagValue: undefined,
                userId: undefined,
              })
          : undefined
      }
      onEnvironmentChange={(env) => setFilters({ env })}
      onOpenReport={(reportId) => {
        void navigate({
          to: "/orgs/$orgSlug/projects/$projectId/reports/$reportId",
          params: { orgSlug, projectId, reportId },
          search,
        });
      }}
      onQueryChange={setDraft}
      onRefresh={reload}
      onTagKeyChange={setTagKeyDraft}
      onTagValueChange={setTagValueDraft}
      onUserIdChange={setUserIdDraft}
      query={draft}
      refreshing={refreshing}
      reports={filteredReports.map((report) =>
        toReportRow(report, reportHref(orgSlug, projectId, report.id, search)),
      )}
      setup={{
        checking: refreshing,
        hasLiveToken: liveTokens > 0,
        snippet: REPORTS_SETUP_SNIPPET,
        tokenHref: `/orgs/${orgSlug}/projects/${projectId}/tokens`,
      }}
      shownCount={filteredReports.length}
      status={status}
      tagKey={tagKeyDraft}
      tagValue={tagValueDraft}
      totalCount={reports.length}
      userId={userIdDraft}
    />
  );
}

function viewStatus(
  load: "loading" | "error" | "ready",
  next: { awaitingFirstReport: boolean; filteredCount: number },
): ReportsViewStatus {
  if (load === "loading") return "loading";
  if (load === "error") return "error";
  if (next.awaitingFirstReport) return "empty";
  if (next.filteredCount === 0) return "no-match";
  return "populated";
}
