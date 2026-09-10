import type { LogLevel } from "../../lib/log-records";
import type { SpanKind, SpanStatus } from "../../lib/traces";

/**
 * An error report attached to a span.
 *
 * @remarks
 * This is not a variant of a span. Issue #10 attaches an error to a span with
 * `(traceId, spanId)` — three records, three shapes, no `Span | Error | Log`
 * union for the tree to switch on.
 */
export interface InvestigationError {
  reportId: string;
  title: string;
  source: string;
  service: string;
  occurredLabel: string;
  fingerprintLabel: string;
  handled: boolean;
}

/**
 * A log record attached to a span.
 *
 * @remarks
 * Same rule as {@link InvestigationError}: a log is its own record, hung off
 * the span it named, not a third arm of a timeline union.
 */
export interface InvestigationLog {
  id: string;
  message: string;
  category: string;
  service: string;
  occurredLabel: string;
  level: LogLevel;
}

/**
 * One stored span, plus the errors and logs that named it.
 *
 * @remarks
 * `errors` and `logs` are collections on the span, not siblings in a mixed
 * list. A pending parent is not a span either — see {@link PendingParentSlot}.
 */
export interface InvestigationSpan {
  spanId: string;
  parentSpanId: string | null;
  /** True when `parentSpanId` is set and that span was never stored. */
  parentMissing: boolean;
  depth: number;
  name: string;
  kind: SpanKind;
  statusCode: SpanStatus;
  statusMessage: string | null;
  serviceName: string;
  scopeLabel: string | null;
  startedAt: string;
  startOffsetNanoseconds: number;
  /** Absent when the span has nothing to measure — the Figma orphan's "—". */
  durationNanoseconds: number | null;
  attributes: Readonly<Record<string, unknown>> | null;
  errors: readonly InvestigationError[];
  logs: readonly InvestigationLog[];
}

/**
 * A dashed placeholder for a parent the server has not stored.
 *
 * @remarks
 * Derived client-side until issue #10 lands: group orphans by the missing
 * `parentSpanId` and sit this slot above the first of them. It is not an
 * error, a log, or a fourth telemetry kind.
 */
export interface PendingParentSlot {
  spanId: string;
  referencedByCount: number;
  /** The first orphan in draw order that named this missing parent. */
  beforeSpanId: string;
}

/**
 * The values the Investigation view paints when a trace has loaded.
 *
 * @remarks
 * Keyed by `(projectId, traceId)` at the route. The view itself only sees
 * this model — no session, no `fetch`.
 */
export interface Investigation {
  traceId: string;
  truncated: boolean;
  shownSpanCount: number;
  totalSpanCount: number;
  failingCount: number;
  durationNanoseconds: number;
  startedLabel: string;
  missingParentCount: number;
  spans: readonly InvestigationSpan[];
  pendingParents: readonly PendingParentSlot[];
}

/**
 * One step of the Investigation location trail.
 *
 * @remarks
 * Named-state factories pass the Figma crumbs so the silhouette photographs
 * Sidebar + TopBar + body. The live route omits `trail` — PageShell already
 * paints that chrome from route staticData.
 */
export interface InvestigationCrumb {
  label: string;
  current?: boolean;
}

type InvestigationTrailProp = {
  trail?: readonly InvestigationCrumb[];
};

export type InvestigationViewProps =
  | ({ status: "loading" } & InvestigationTrailProp)
  | ({
      status: "ready";
      investigation: Investigation;
      expandedSpanId: string | null;
      onToggleSpan?: (spanId: string) => void;
      onOpenReport?: (reportId: string) => void;
    } & InvestigationTrailProp);
