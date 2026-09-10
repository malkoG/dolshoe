import type { TraceSummary } from "../../lib/traces";
import type { TracesScreenProps } from "./traces-screen";

/**
 * Named states for screen 24 — Traces.
 *
 * @remarks
 * Figma paints two frames: a populated list (`95:2`) and the empty setup
 * state (`95:435`). The view can also load and fail, so those are here too.
 * "No matching traces" is the same empty silhouette with different words;
 * the construction test covers it without a second PNG.
 */
function noop(): void {}

function agoIso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function trace(partial: Omit<TraceSummary, "rootSpanId" | "statusCode">): TraceSummary {
  return {
    rootSpanId: `${partial.traceId.slice(0, 16)}`,
    statusCode: partial.errorSpanCount > 0 ? "error" : "ok",
    ...partial,
  };
}

/**
 * The six rows Figma designed. The frame labels the list "18 traces"; only
 * these rows change the silhouette (every span kind, a failing pair, staging).
 */
function populatedTraces(): TraceSummary[] {
  return [
    trace({
      traceId: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
      name: "GET /checkout",
      kind: "server",
      serviceName: "api-gateway",
      environment: "production",
      startedAt: agoIso(5 * MINUTE),
      durationNanoseconds: 142_000_000,
      spanCount: 6,
      errorSpanCount: 2,
    }),
    trace({
      traceId: "b2c3d4e5f60718293a4b5c6d7e8f90a1",
      name: "POST /api/v1/payments/authorize",
      kind: "server",
      serviceName: "payments",
      environment: "production",
      startedAt: agoIso(9 * MINUTE),
      durationNanoseconds: 1_240_000_000,
      spanCount: 4,
      errorSpanCount: 1,
    }),
    trace({
      traceId: "c3d4e5f60718293a4b5c6d7e8f90a1b2",
      name: "send-receipt",
      kind: "consumer",
      serviceName: "worker",
      environment: "production",
      startedAt: agoIso(14 * MINUTE),
      durationNanoseconds: 482_000_000,
      spanCount: 3,
      errorSpanCount: 0,
    }),
    trace({
      traceId: "d4e5f60718293a4b5c6d7e8f90a1b2c3",
      name: "issuer.charge",
      kind: "client",
      serviceName: "payments",
      environment: "staging",
      startedAt: agoIso(31 * MINUTE),
      durationNanoseconds: 930_000_000,
      spanCount: 2,
      errorSpanCount: 0,
    }),
    trace({
      traceId: "e5f60718293a4b5c6d7e8f90a1b2c3d4",
      name: "order.created",
      kind: "producer",
      serviceName: "checkout-api",
      environment: "production",
      startedAt: agoIso(1 * HOUR),
      durationNanoseconds: 3_100_000,
      spanCount: 1,
      errorSpanCount: 0,
    }),
    trace({
      traceId: "f60718293a4b5c6d7e8f90a1b2c3d4e5",
      name: "cart.rebuild",
      kind: "internal",
      serviceName: "checkout-api",
      environment: "production",
      startedAt: agoIso(2 * HOUR),
      durationNanoseconds: 67_000_000,
      spanCount: 9,
      errorSpanCount: 0,
    }),
  ];
}

const idleControls = {
  errorsOnly: false,
  onErrorsOnlyChange: noop as (checked: boolean) => void,
  onQueryChange: noop as (value: string) => void,
  onRefresh: noop,
  query: "",
  refreshing: false,
} as const;

function empty(): TracesScreenProps {
  return {
    ...idleControls,
    status: "ready",
    traces: [],
  };
}

function populated(): TracesScreenProps {
  return {
    ...idleControls,
    status: "ready",
    traces: populatedTraces(),
  };
}

function error(): TracesScreenProps {
  return {
    ...idleControls,
    errorDescription: "The API did not answer.",
    status: "error",
    traces: [],
  };
}

function inProgress(): TracesScreenProps {
  return {
    ...idleControls,
    status: "loading",
    traces: [],
  };
}

export const tracesScreenStates = {
  empty,
  populated,
  error,
  inProgress,
} as const;

export const tracesScreenStateNames = ["empty", "populated", "error", "inProgress"] as const;

export type TracesScreenStateName = (typeof tracesScreenStateNames)[number];

export function isTracesScreenStateName(value: string | null): value is TracesScreenStateName {
  return value != null && (tracesScreenStateNames as readonly string[]).includes(value);
}
