import { DataState } from "@dolshoe/ui/components/data-state";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Waypoints } from "lucide-react";
import { useState } from "react";

import { describeError } from "../lib/api-request";
import { fetchTrace } from "../lib/traces";
import { useResource } from "../lib/use-resource";
import { firstFailingSpanId, investigationFromTrace } from "../screens/investigation/from-trace";
import { formatTraceChip } from "../screens/investigation/format";
import { InvestigationView } from "../screens/investigation/investigation";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/traces/$traceId")({
  staticData: {
    breadcrumb: ({ params }) => `Investigation ${formatTraceChip(params.traceId ?? "")}`,
  },
  component: Investigation,
});

/**
 * The composition root for Investigation: fetch the trace, derive missing
 * parents, hang nothing that is not a span/error/log of its own.
 *
 * @remarks
 * Errors and logs are not on the trace read yet — issue #10. The route
 * passes empty attachments so the view still paints spans, orphans, and
 * pending-parent slots from what landed. Named-state factories are the
 * other composition root and already show the attaches.
 */
function Investigation() {
  const { orgSlug, projectId, traceId } = Route.useParams();
  const navigate = useNavigate();
  const [expandedSpanId, setExpandedSpanId] = useState<string | null>(null);

  const { reload, state } = useResource(
    ({ signal }) => fetchTrace(orgSlug, projectId, traceId, { signal }),
    [orgSlug, projectId, traceId],
  );

  if (state.status === "loading") {
    return <InvestigationView status="loading" />;
  }

  if (state.status === "error") {
    return (
      <DataState
        kind="error"
        title="Couldn't load this investigation"
        description={describeError(state.error, "Something went wrong while loading this trace.")}
        onRetry={reload}
      />
    );
  }

  if (state.data.spans.length === 0) {
    return (
      <DataState
        kind="empty"
        icon={Waypoints}
        title="Nothing stored under this trace"
        description="Its spans may never have been exported, or may have passed their retention."
        action={
          <Button asChild size="sm" variant="outline">
            <Link params={{ orgSlug, projectId }} to="/orgs/$orgSlug/projects/$projectId/traces">
              All traces
            </Link>
          </Button>
        }
      />
    );
  }

  const investigation = investigationFromTrace(state.data);
  const openSpanId = expandedSpanId ?? firstFailingSpanId(investigation.spans);

  return (
    <InvestigationView
      expandedSpanId={openSpanId}
      investigation={investigation}
      onOpenReport={(reportId) =>
        void navigate({
          to: "/orgs/$orgSlug/projects/$projectId/reports/$reportId",
          params: { orgSlug, projectId, reportId },
        })
      }
      onToggleSpan={(spanId) =>
        setExpandedSpanId((current) => {
          const effective = current ?? firstFailingSpanId(investigation.spans);
          return effective === spanId ? null : spanId;
        })
      }
      status="ready"
    />
  );
}
