import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Clock3, Loader2, RefreshCw, Waypoints } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../lib/api-request";
import { formatDuration, formatRelativeTime } from "../lib/format";
import { fetchTrace } from "../lib/traces";
import type { TraceDetailResponse, TraceSpan } from "../lib/traces";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/traces/$traceId")({
  component: Trace,
});

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; trace: TraceDetailResponse };

/** Narrow enough that a deep trace still leaves room for the bar. */
const INDENT_PER_LEVEL = 14;
/** A span far shorter than the trace would otherwise be an invisible bar. */
const MINIMUM_BAR_PERCENT = 0.4;

function describeLoadError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading this trace.";
}

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

function SpanRow({ span, traceDuration }: { span: TraceSpan; traceDuration: number }) {
  const [expanded, setExpanded] = useState(false);
  const { left, width } = barGeometry(span, traceDuration);
  const attributes = attributeEntries(span.attributes);
  const failed = span.statusCode === "error";

  return (
    <div className={`span-row${failed ? " span-row-error" : ""}`}>
      <button
        aria-expanded={expanded}
        className="span-summary"
        onClick={() => setExpanded((open) => !open)}
        type="button"
      >
        <span className="span-label" style={{ paddingInlineStart: span.depth * INDENT_PER_LEVEL }}>
          {span.depth > 0 && <span aria-hidden="true" className="span-guide" />}
          <span className="span-name">{span.name}</span>
          <span className={`span-kind span-kind-${span.kind}`}>{span.kind}</span>
        </span>

        <span className="span-bar-track">
          <span
            className={`span-bar${failed ? " span-bar-error" : ""}`}
            style={{ insetInlineStart: `${left}%`, width: `${width}%` }}
          />
        </span>

        <span className="span-duration">{formatDuration(span.durationNanoseconds)}</span>
      </button>

      {expanded && (
        <dl className="span-detail">
          <dt>Span</dt>
          <dd>
            <code>{span.spanId}</code>
          </dd>
          <dt>Parent</dt>
          <dd>{span.parentSpanId == null ? "—" : <code>{span.parentSpanId}</code>}</dd>
          <dt>Service</dt>
          <dd>{span.serviceName}</dd>
          <dt>Started</dt>
          <dd>
            <time dateTime={span.startedAt}>{span.startedAt}</time>
          </dd>
          {span.scopeName != null && (
            <>
              <dt>Scope</dt>
              <dd>
                {span.scopeName}
                {span.scopeVersion != null && ` ${span.scopeVersion}`}
              </dd>
            </>
          )}
          {span.statusMessage != null && (
            <>
              <dt>Status</dt>
              <dd>{span.statusMessage}</dd>
            </>
          )}
          {attributes.length > 0 && (
            <>
              <dt>Attributes</dt>
              <dd>
                <div className="log-attributes">
                  {attributes.map(([key, value]) => (
                    <span className="log-attribute" key={key}>
                      <span className="log-attribute-key">{key}</span>
                      {value}
                    </span>
                  ))}
                </div>
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
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchTrace(orgSlug, projectId, traceId, { signal: controller.signal })
      .then((trace) => {
        if (!cancelled) setState({ status: "ready", trace });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [orgSlug, projectId, traceId, reloadToken]);

  return (
    <section className="report-panel">
      <div className="filter-bar">
        <Link
          className="back-link"
          params={{ orgSlug, projectId }}
          to="/orgs/$orgSlug/projects/$projectId/traces"
        >
          <ArrowLeft size={14} />
          All traces
        </Link>

        {state.status === "ready" && (
          <div className="filter-controls trace-header-meta">
            <code className="trace-id">{traceId}</code>
            <span className="meta-separator">·</span>
            {state.trace.trace.spanCount} spans
            <span className="meta-separator">·</span>
            {formatDuration(state.trace.trace.durationNanoseconds)}
            <span className="time-cell">
              <Clock3 size={14} />
              <time dateTime={state.trace.trace.startedAt}>
                {formatRelativeTime(state.trace.trace.startedAt)}
              </time>
            </span>
          </div>
        )}
      </div>

      <div className="trace-waterfall" aria-live="polite">
        {state.status === "loading" && (
          <div className="state-panel state-panel-loading" role="status">
            <span className="state-icon">
              <Loader2 className="spin" size={19} />
            </span>
            <strong>Loading trace…</strong>
            <p>Fetching this trace's spans from the API.</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="state-panel state-panel-error" role="alert">
            <span className="state-icon">
              <AlertTriangle size={19} />
            </span>
            <strong>Couldn't load this trace</strong>
            <p>{describeLoadError(state.error)}</p>
            <button onClick={() => setReloadToken((token) => token + 1)} type="button">
              <RefreshCw size={13} />
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && state.trace.spans.length === 0 && (
          <div className="state-panel">
            <span className="state-icon">
              <Waypoints size={19} />
            </span>
            <strong>Nothing stored under this trace</strong>
            <p>Its spans may never have been exported, or may have passed their retention.</p>
          </div>
        )}

        {state.status === "ready" &&
          state.trace.spans.map((span) => (
            <SpanRow
              key={span.id}
              span={span}
              traceDuration={state.trace.trace.durationNanoseconds}
            />
          ))}
      </div>

      {state.status === "ready" && state.trace.spans.length > 0 && (
        <footer className="panel-footer">
          <span>
            Showing <strong>{state.trace.spans.length}</strong> spans
          </span>
          <span className="panel-footer-note">
            {state.trace.trace.truncated
              ? "This trace holds more spans than are shown"
              : "Nested by parent, oldest first"}
          </span>
        </footer>
      )}
    </section>
  );
}
