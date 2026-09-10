import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

import { describeError } from "../lib/api-request";
import { flagParam, textParam } from "../lib/list-filters";
import { fetchTraces } from "../lib/traces";
import { useResource } from "../lib/use-resource";
import { useUrlTextFilter } from "../lib/use-url-text-filter";
import { TracesScreen, type TracesScreenLinkProps } from "../screens/traces/traces-screen";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/traces/")({
  validateSearch: (search: Record<string, unknown>): { q?: string; errors?: true } => ({
    q: textParam(search.q),
    errors: flagParam(search.errors),
  }),
  staticData: { breadcrumb: "Traces" },
  component: Traces,
});

/**
 * Composition root for screen 24. Session, the URL, and the API stay here;
 * the public view only receives values and the link port.
 */
function Traces() {
  const { orgSlug, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const errorsOnly = search.errors === true;

  function setFilters(next: { q?: string; errors?: true }): void {
    void navigate({ replace: true, search: (previous) => ({ ...previous, ...next }) });
  }

  const { draft, setDraft } = useUrlTextFilter(query, (q) => setFilters({ q }));

  const { refreshing, reload, state } = useResource(
    ({ signal }) => fetchTraces(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  function renderLink({ children, className, target }: TracesScreenLinkProps) {
    if (target.kind === "setup") {
      return (
        <Link
          className={className}
          params={{ orgSlug, projectId }}
          to="/orgs/$orgSlug/projects/$projectId/tokens"
        >
          {children}
        </Link>
      );
    }

    return (
      <Link
        className={className}
        params={{ orgSlug, projectId, traceId: target.traceId }}
        to="/orgs/$orgSlug/projects/$projectId/traces/$traceId"
      >
        {children}
      </Link>
    );
  }

  return (
    <TracesScreen
      errorDescription={
        state.status === "error"
          ? describeError(state.error, "Something went wrong while loading traces.")
          : undefined
      }
      errorsOnly={errorsOnly}
      onErrorsOnlyChange={(checked) => setFilters({ errors: checked || undefined })}
      onQueryChange={setDraft}
      onRefresh={reload}
      query={draft}
      refreshing={refreshing}
      renderLink={renderLink}
      status={state.status}
      traces={state.status === "ready" ? state.data : []}
    />
  );
}
