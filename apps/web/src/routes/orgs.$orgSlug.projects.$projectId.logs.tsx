import { Button } from "@dolshoe/ui/components/ui/button";
import { Link, createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useMemo, useState } from "react";

import { describeError } from "../lib/api-request";
import { optionParam, textParam } from "../lib/list-filters";
import { fetchLogRecords } from "../lib/log-records";
import type { LogLevel } from "../lib/log-records";
import { useResource } from "../lib/use-resource";
import { useUrlTextFilter } from "../lib/use-url-text-filter";
import { type LogVolumeRange, volumeFromRecords } from "../screens/logs/log-volume-chart";
import { LOG_LEVELS, LogsScreen, type LogsDensity } from "../screens/logs/logs-screen";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/logs")({
  staticData: { breadcrumb: "Logs" },
  validateSearch: (search: Record<string, unknown>): { q?: string; level?: LogLevel } => ({
    q: textParam(search.q),
    level: optionParam(search.level, LOG_LEVELS),
  }),
  component: Logs,
});

const projectRoute = getRouteApi("/orgs/$orgSlug/projects/$projectId");

function Logs() {
  const { orgSlug, projectId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const { projects } = projectRoute.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const level = search.level ?? "all";
  const [density, setDensity] = useState<LogsDensity>("compact");
  const [range, setRange] = useState<LogVolumeRange>("24h");

  function setFilters(next: { q?: string; level?: LogLevel }): void {
    void navigate({ replace: true, search: (previous) => ({ ...previous, ...next }) });
  }

  const { draft, setDraft } = useUrlTextFilter(query, (q) => setFilters({ q }));

  // Severity is a server-side filter because the listing is bounded: filtering
  // it in the browser would only ever narrow the newest 100 records.
  const { refreshing, reload, state } = useResource(
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

  const volume = useMemo(() => volumeFromRecords(records, range), [records, range]);
  const organization = session.organizations.find((candidate) => candidate.slug === orgSlug);
  const project = projects.find((candidate) => candidate.id === projectId);

  return (
    <LogsScreen
      density={density}
      embedded
      trail={[
        { label: organization?.name ?? orgSlug },
        { label: project?.name ?? "…" },
        { label: "Logs" },
      ]}
      emptyAction={
        <Button asChild size="sm" variant="outline">
          <Link params={{ orgSlug, projectId }} to="/orgs/$orgSlug/projects/$projectId/tokens">
            <KeyRound />
            Set up reporting
          </Link>
        </Button>
      }
      errorDescription={
        state.status === "error"
          ? describeError(state.error, "Something went wrong while loading log records.")
          : undefined
      }
      filteredRecords={filteredRecords}
      level={level}
      onClearLevelFilter={() => setFilters({ level: undefined })}
      onDensityChange={setDensity}
      onLevelChange={(next) => setFilters({ level: next === "all" ? undefined : next })}
      onQueryChange={setDraft}
      onRangeChange={setRange}
      onRefresh={reload}
      query={draft}
      records={records}
      refreshing={refreshing}
      status={state.status}
      volume={volume}
    />
  );
}
