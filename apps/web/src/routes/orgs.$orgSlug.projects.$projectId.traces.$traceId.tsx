import { DataState } from "@dolshoe/ui/components/data-state";
import {
  Panel,
  PanelBar,
  PanelControls,
  PanelFooter,
  PanelFooterNote,
} from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { cn } from "@dolshoe/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Clock3, Waypoints } from "lucide-react";
import { useState } from "react";

import { SpanKindBadge } from "../components/span-kind-badge";
import { describeError } from "../lib/api-request";
import { formatDuration, formatRelativeTime, pluralize } from "../lib/format";
import { fetchTrace } from "../lib/traces";
import type { TraceSpan } from "../lib/traces";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/traces/$traceId")({
  component: Trace,
});

/** Narrow enough that a deep trace still leaves room for the bar. */
const INDENT_PER_LEVEL = 14;
/** A span far shorter than the trace would otherwise be an invisible bar. */
const MINIMUM_BAR_PERCENT = 0.4;

function attributeEntries(attributes: TraceSpan["attributes"]): Array<[string, string]> {
  if (attributes == null) return [];
  return Object.entries(attributes).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

function barGeometry(span: TraceSpan, traceDuration: number) {
  // A trace whose spans all share one instant has no width to divide by; laying
  // every bar out full-width reads better than dividing by zero.
  if (traceDuration <= 0) return { left: 0, width: 100 };

  const left = (span.startOffsetNanoseconds / traceDuration) * 100;
  const width = Math.max((span.durationNanoseconds / traceDuration) * 100, MINIMUM_BAR_PERCENT);

  return { left: Math.min(left, 100 - MINIMUM_BAR_PERCENT), width };
}

/**
 * One span in the waterfall, and everything known about it once opened.
 *
 * @remarks
 * The bar's position and width are the one thing here that genuinely cannot be
 * a class: they are a proportion of the trace's own duration, computed per row.
 * Logical properties keep them correct if the page is ever laid out
 * right-to-left.
 */
function SpanRow({ span, traceDuration }: Readonly<{ span: TraceSpan; traceDuration: number }>) {
  const [expanded, setExpanded] = useState(false);
  const { left, width } = barGeometry(span, traceDuration);
  const attributes = attributeEntries(span.attributes);
  const failed = span.statusCode === "error";

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        aria-expanded={expanded}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-2.5 text-left transition-colors hover:bg-muted md:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.4fr)_auto]"
        onClick={() => setExpanded((open) => !open)}
        type="button"
      >
        <span
          className="flex min-w-0 items-center gap-2"
          style={{ paddingInlineStart: span.depth * INDENT_PER_LEVEL }}
        >
          {span.depth > 0 && (
            <span
              aria-hidden="true"
              className="h-3.5 w-2 shrink-0 border-b border-l border-input"
            />
          )}
          <span
            className={cn("truncate text-[12px] font-semibold", failed && "text-brand")}
            title={span.name}
          >
            {span.name}
          </span>
          <SpanKindBadge className="hidden sm:inline-flex" kind={span.kind} />
        </span>

        <span className="relative col-span-2 h-1.5 overflow-hidden rounded-full bg-secondary md:col-span-1">
          <span
            className={cn("absolute inset-y-0 rounded-full", failed ? "bg-brand" : "bg-success")}
            style={{ insetInlineStart: `${left}%`, width: `${width}%` }}
          />
        </span>

        <span className="font-mono text-[11px] whitespace-nowrap tabular-nums text-muted-foreground">
          {formatDuration(span.durationNanoseconds)}
        </span>
      </button>

      {expanded && (
        <dl className="grid grid-cols-[minmax(80px,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-border bg-muted px-5 py-4 text-[11px]">
          <dt className="font-semibold text-faint">Span</dt>
          <dd className="min-w-0">
            <code className="font-mono break-all">{span.spanId}</code>
          </dd>
          <dt className="font-semibold text-faint">Parent</dt>
          <dd className="min-w-0">
            {span.parentSpanId == null ? (
              "—"
            ) : (
              <code className="font-mono break-all">{span.parentSpanId}</code>
            )}
          </dd>
          <dt className="font-semibold text-faint">Service</dt>
          <dd className="min-w-0">{span.serviceName}</dd>
          <dt className="font-semibold text-faint">Started</dt>
          <dd className="min-w-0">
            <time dateTime={span.startedAt}>{span.startedAt}</time>
          </dd>
          {span.scopeName != null && (
            <>
              <dt className="font-semibold text-faint">Scope</dt>
              <dd className="min-w-0">
                {span.scopeName}
                {span.scopeVersion != null && ` ${span.scopeVersion}`}
              </dd>
            </>
          )}
          {span.statusMessage != null && (
            <>
              <dt className="font-semibold text-faint">Status</dt>
              <dd className="min-w-0">{span.statusMessage}</dd>
            </>
          )}
          {attributes.length > 0 && (
            <>
              <dt className="font-semibold text-faint">Attributes</dt>
              <dd className="flex min-w-0 flex-wrap gap-1.5">
                {attributes.map(([key, value]) => (
                  <span
                    className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border bg-card px-2 py-1 font-mono text-[10px]"
                    key={key}
                  >
                    <span className="text-faint">{key}</span>
                    {value}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

function Trace() {
  const { orgSlug, projectId, traceId } = Route.useParams();

  const { reload, state } = useResource(
    ({ signal }) => fetchTrace(orgSlug, projectId, traceId, { signal }),
    [orgSlug, projectId, traceId],
  );

  return (
    <Panel>
      <PanelBar>
        <Button asChild size="sm" variant="ghost">
          <Link params={{ orgSlug, projectId }} to="/orgs/$orgSlug/projects/$projectId/traces">
            <ArrowLeft />
            All traces
          </Link>
        </Button>

        {state.status === "ready" && (
          <PanelControls className="gap-1.5 text-[11px] text-muted-foreground">
            <code className="max-w-40 truncate font-mono text-[10px] md:max-w-none">{traceId}</code>
            <span aria-hidden="true">·</span>
            {pluralize(state.data.trace.spanCount, "span")}
            <span aria-hidden="true">·</span>
            {formatDuration(state.data.trace.durationNanoseconds)}
            <span className="flex items-center gap-1.5 font-mono text-[10px]">
              <Clock3 className="size-3.5" />
              <time dateTime={state.data.trace.startedAt}>
                {formatRelativeTime(state.data.trace.startedAt)}
              </time>
            </span>
          </PanelControls>
        )}
      </PanelBar>

      <div aria-live="polite">
        {state.status === "loading" && (
          <DataState
            kind="loading"
            title="Loading trace…"
            description="Fetching this trace's spans from the API."
          />
        )}

        {state.status === "error" && (
          <DataState
            kind="error"
            title="Couldn't load this trace"
            description={describeError(
              state.error,
              "Something went wrong while loading this trace.",
            )}
            onRetry={reload}
          />
        )}

        {state.status === "ready" && state.data.spans.length === 0 && (
          <DataState
            kind="empty"
            icon={Waypoints}
            title="Nothing stored under this trace"
            description="Its spans may never have been exported, or may have passed their retention."
          />
        )}

        {state.status === "ready" &&
          state.data.spans.map((span) => (
            <SpanRow
              key={span.id}
              span={span}
              traceDuration={state.data.trace.durationNanoseconds}
            />
          ))}
      </div>

      {state.status === "ready" && state.data.spans.length > 0 && (
        <PanelFooter>
          <span>
            Showing <strong className="font-bold text-foreground">{state.data.spans.length}</strong>{" "}
            spans
          </span>
          <PanelFooterNote>
            {state.data.trace.truncated
              ? "This trace holds more spans than are shown"
              : "Nested by parent, oldest first"}
          </PanelFooterNote>
        </PanelFooter>
      )}
    </Panel>
  );
}
