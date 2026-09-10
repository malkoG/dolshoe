import type { LogRecordSummary } from "../../lib/log-records";
import type { LogVolume } from "./log-volume-chart";
import type { LogsConsoleRow, LogsConsoleState } from "./logs-console";
import type { LogsListProps, LogsLiveProps, LogsScreenProps } from "./logs-screen";

/**
 * Named states for the Logs screen.
 *
 * @remarks
 * The view is a public view: it receives records (or a console stub) and
 * paints them. These factories are the other composition root — the one a
 * construction test and a silhouette use instead of fetching.
 *
 * `populated` is the list Figma framed (filtered volume, one row open).
 * `live` is the other frame: console + detail drawer. There is no loading
 * silhouette — a spinner is not a layout the reviewer needs photographed.
 */

function noop(): void {}

const FILTERED_HEIGHTS = [
  32, 24, 22, 16, 14, 11, 16, 24, 38, 54, 70, 76, 84, 95, 81, 65, 59, 54, 49, 43, 38, 32, 27, 24,
];

function hourlyVolume(heights: readonly number[], extras: Partial<LogVolume> = {}): LogVolume {
  return {
    buckets: heights.map((height, hour) => ({
      errors: 0,
      label: `${String(hour).padStart(2, "0")}:00`,
      logs: Math.round((height / 108) * 400),
    })),
    range: "24h",
    subtitle: "Last 24 hours · 1h buckets",
    totals: { errors: 245, logs: 4975 },
    ...extras,
  };
}

function stackedVolume(): LogVolume {
  const logs = FILTERED_HEIGHTS.map((height) => Math.round((height / 108) * 380));
  const errors = FILTERED_HEIGHTS.map((_, hour) =>
    hour === 13 ? 28 : hour === 10 ? 12 : hour === 16 ? 8 : 0,
  );
  return {
    buckets: logs.map((count, hour) => ({
      errors: errors[hour] ?? 0,
      label: `${String(hour).padStart(2, "0")}:00`,
      logs: count,
    })),
    range: "24h",
    subtitle: "Last 24 hours · 1h buckets",
    totals: { errors: 245, logs: 4975 },
  };
}

function record(partial: {
  attributes?: LogRecordSummary["attributes"];
  category: string[];
  environment?: string;
  id: string;
  level: LogRecordSummary["level"];
  message: string;
  occurredAt: string;
  service: string;
}): LogRecordSummary {
  return {
    attributes: partial.attributes ?? null,
    category: partial.category,
    errorReportEventId: null,
    eventId: partial.id,
    id: partial.id,
    level: partial.level,
    message: partial.message,
    occurredAt: partial.occurredAt,
    receivedAt: partial.occurredAt,
    service: {
      environment: partial.environment,
      name: partial.service,
    },
  };
}

const POPULATED_RECORDS: LogRecordSummary[] = [
  record({
    attributes: { pid: 4172 },
    category: ["process"],
    environment: "prod",
    id: "fatal-worker",
    level: "fatal",
    message: "worker exiting: unrecoverable state",
    occurredAt: "2026-09-10T13:02:43.005Z",
    service: "worker",
  }),
  record({
    attributes: { attempt: 2, provider: "stripe" },
    category: ["authorize"],
    environment: "production",
    id: "error-authorize",
    level: "error",
    message: "authorize failed: do_not_honor",
    occurredAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    service: "payments",
  }),
  record({
    attributes: { reason: "missing_payment" },
    category: ["checkout"],
    environment: "prod",
    id: "error-cart",
    level: "error",
    message: "cart validation failed",
    occurredAt: "2026-09-10T13:01:12.440Z",
    service: "checkout-api",
  }),
  record({
    attributes: { attempts: 3, job: "send-receipt" },
    category: ["queue"],
    environment: "prod",
    id: "error-job",
    level: "error",
    message: "job failed after 3 attempts",
    occurredAt: "2026-09-10T12:58:03.910Z",
    service: "worker",
  }),
  record({
    category: ["http"],
    environment: "prod",
    id: "info-health",
    level: "info",
    message: "GET /healthz 200",
    occurredAt: "2026-09-10T12:50:00.000Z",
    service: "api",
  }),
  record({
    category: ["http"],
    environment: "prod",
    id: "info-cart",
    level: "info",
    message: "GET /api/v1/cart",
    occurredAt: "2026-09-10T12:46:00.000Z",
    service: "api",
  }),
  record({
    category: ["checkout"],
    environment: "prod",
    id: "debug-retry",
    level: "debug",
    message: "payment.retry scheduled in 500ms",
    occurredAt: "2026-09-10T12:41:00.000Z",
    service: "payments",
  }),
];

function listDefaults(): Omit<LogsListProps, "filteredRecords" | "records" | "status"> {
  return {
    density: "compact",
    errorDescription: undefined,
    expandedRecordId: undefined,
    level: "all",
    onClearLevelFilter: noop,
    onDensityChange: noop,
    onLevelChange: noop,
    onQueryChange: noop,
    onRangeChange: noop,
    onRefresh: noop,
    query: "",
    refreshing: false,
    volume: {
      buckets: Array.from({ length: 24 }, (_, hour) => ({
        errors: 0,
        label: `${String(hour).padStart(2, "0")}:00`,
        logs: 0,
      })),
      range: "24h",
      subtitle: "Last 24 hours · 1h buckets",
      totals: { errors: 0, logs: 0 },
    },
  };
}

function empty(): LogsScreenProps {
  return {
    ...listDefaults(),
    filteredRecords: [],
    records: [],
    status: "ready",
  };
}

/**
 * The ordinary list: a severity filter, the volume that goes with it, and
 * the authorize row open so the comfortable layout is visible next to the
 * compact console lines.
 */
function populated(): LogsScreenProps {
  const records = POPULATED_RECORDS;
  const filteredRecords = records.filter(
    (candidate) => candidate.level === "error" || candidate.level === "fatal",
  );

  return {
    ...listDefaults(),
    expandedRecordId: "error-authorize",
    filteredRecords,
    level: "error",
    records,
    status: "ready",
    volume: hourlyVolume(FILTERED_HEIGHTS),
  };
}

function error(): LogsScreenProps {
  return {
    ...listDefaults(),
    errorDescription: "The API refused the request.",
    filteredRecords: [],
    records: [],
    status: "error",
  };
}

function consoleRow(partial: LogsConsoleRow): LogsConsoleRow {
  return partial;
}

function liveConsole(): LogsConsoleState {
  return {
    connected: true,
    detail: {
      argumentsJson: `{  2 items
    "dob": "1990-01-01",
    "age": 1095465600,
}`,
      codeFile: "apps/api/src/payments/authorize.ts",
      codeLine: "88",
      service: "payments",
      spanId: "7f2a9c1e3b4d5e6f",
      timestamp: "2026-09-10 13:02:43.004",
      title: "authorize failed: do_not_honor",
      traceId: "4f2a9c1e3b4d5e6f7a8b9c0d1e2f3a4b",
    },
    footerNote: "live · newest at the bottom",
    footerText: "12 records · 3 spans in window",
    rows: [
      consoleRow({
        childCount: 4,
        duration: "3.1s",
        id: "span-checkout",
        indent: false,
        kind: "span",
        message: "POST /api/v1/checkout",
        offset: 0.04,
        service: "api",
        time: "13:02:40",
        tone: "info",
        width: 0.5,
      }),
      consoleRow({
        id: "log-cart",
        indent: true,
        kind: "log",
        message: "cart loaded  items=3 session=sess_4f2a",
        offset: 0.05,
        service: "api",
        time: "13:02:40",
        tone: "info",
        width: 0,
      }),
      consoleRow({
        childCount: 2,
        duration: "2.0s",
        id: "span-authorize",
        indent: true,
        kind: "span",
        message: "payment.authorize",
        offset: 0.12,
        service: "payments",
        time: "13:02:41",
        tone: "info",
        width: 0.5,
      }),
      consoleRow({
        id: "log-retry",
        indent: true,
        kind: "log",
        message: "payment.retry scheduled in 500ms  attempt=2 provider=stripe",
        offset: 0.14,
        service: "payments",
        time: "13:02:41",
        tone: "info",
        width: 0,
      }),
      consoleRow({
        id: "log-latency",
        indent: true,
        kind: "log",
        message: "issuer latency 1.8s exceeds 1s budget  p95=1.62s",
        offset: 0.35,
        service: "payments",
        time: "13:02:42",
        tone: "warning",
        width: 0,
      }),
      consoleRow({
        id: "log-honor",
        indent: true,
        kind: "log",
        message: "authorize failed: do_not_honor  card=****4242 amount=12900",
        offset: 0.4,
        selected: true,
        service: "payments",
        time: "13:02:43",
        tone: "danger",
        width: 0,
      }),
      consoleRow({
        id: "log-worker",
        indent: false,
        kind: "log",
        message: "worker exiting: unrecoverable state  pid=4172",
        offset: 0.42,
        service: "worker",
        time: "13:02:43",
        tone: "danger",
        width: 0,
      }),
      consoleRow({
        childCount: 1,
        duration: "482ms",
        id: "span-receipt",
        indent: false,
        kind: "span",
        message: "send-receipt",
        offset: 0.08,
        service: "worker",
        time: "13:02:44",
        tone: "info",
        width: 0.35,
      }),
      consoleRow({
        id: "log-template",
        indent: true,
        kind: "log",
        message: "receipt rendered template",
        offset: 0.2,
        service: "worker",
        time: "13:02:44",
        tone: "info",
        width: 0,
      }),
      consoleRow({
        childCount: 0,
        duration: "41ms",
        id: "span-cart",
        indent: false,
        kind: "span",
        message: "GET /api/v1/cart",
        offset: 0.02,
        service: "api",
        time: "13:02:46",
        tone: "info",
        width: 0.55,
      }),
      consoleRow({
        id: "log-route",
        indent: false,
        kind: "log",
        message: "route /cart → /checkout",
        offset: 0.61,
        service: "storefront",
        time: "13:02:48",
        tone: "info",
        width: 0,
      }),
      consoleRow({
        id: "log-health",
        indent: false,
        kind: "log",
        message: "GET /healthz 200  ms=2",
        offset: 0.67,
        service: "api",
        time: "13:02:50",
        tone: "info",
        width: 0,
      }),
    ],
  };
}

function live(): LogsLiveProps {
  return {
    console: liveConsole(),
    mode: "live",
    onClearLevelFilter: noop,
    onRangeChange: noop,
    onStopLive: noop,
    volume: stackedVolume(),
  };
}

export const logsScreenStates = {
  empty,
  populated,
  error,
  live,
} as const;

export const logsScreenStateNames = ["empty", "populated", "error", "live"] as const;

export type LogsScreenStateName = (typeof logsScreenStateNames)[number];

export function isLogsScreenStateName(value: string | null): value is LogsScreenStateName {
  return value != null && (logsScreenStateNames as readonly string[]).includes(value);
}
