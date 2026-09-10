import type { ReportRowModel } from "./report-row";
import type { ReportsViewProps } from "./reports-view";
import { REPORTS_SETUP_SNIPPET } from "./reports-setup";

function noop(): void {}
function noopString(_value: string): void {}
function noopOptionalString(_value: string | undefined): void {}

const FIGMA_TAGS: ReadonlyArray<readonly [string, string]> = [
  ["release", "1.42.0"],
  ["region", "ap-northeast-2"],
];

function row(
  partial: Omit<ReportRowModel, "href" | "tags"> & { tags?: ReportRowModel["tags"] },
): ReportRowModel {
  return {
    href: `/orgs/acme-payments/projects/checkout-api/reports/${partial.id}`,
    tags: FIGMA_TAGS,
    ...partial,
  };
}

const populatedRows: ReportRowModel[] = [
  row({
    id: "7f2a9c1e-0000-4000-8000-000000000001",
    exceptionType: "TypeError",
    message: 'Cannot read properties of undefined (reading "amount")',
    source: "handleCheckout · checkout.ts:214",
    sourceTitle: "checkout.ts",
    service: "checkout-api",
    environment: "production",
    runtime: "Node 22.3.0",
    occurredAt: "2026-09-10T20:21:00.000Z",
    occurredLabel: "3 minutes ago",
  }),
  row({
    id: "3e91c0a7-0000-4000-8000-000000000002",
    exceptionType: "CardDeclinedError",
    message: "card declined by issuer (do_not_honor)",
    source: "authorize · authorize.ts:88",
    sourceTitle: "authorize.ts",
    service: "payments",
    environment: "production",
    runtime: "Node 22.3.0",
    occurredAt: "2026-09-10T20:12:00.000Z",
    occurredLabel: "12 minutes ago",
  }),
  row({
    id: "b7d2f41a-0000-4000-8000-000000000003",
    exceptionType: "TimeoutError",
    message: "issuer gateway did not respond within 5000ms",
    source: "callIssuer · issuer-client.ts:41",
    sourceTitle: "issuer-client.ts",
    service: "payments",
    environment: "staging",
    runtime: "Node 22.3.0",
    occurredAt: "2026-09-10T19:24:00.000Z",
    occurredLabel: "1 hour ago",
  }),
  row({
    id: "c41e9a02-0000-4000-8000-000000000004",
    exceptionType: "ValueError",
    message: "invalid literal for int() with base 10: 'abc'",
    source: "parse_amount · parsers.py:52",
    sourceTitle: "parsers.py",
    service: "worker",
    environment: "production",
    runtime: "Python 3.12",
    occurredAt: "2026-09-10T18:24:00.000Z",
    occurredLabel: "2 hours ago",
  }),
  row({
    id: "0a8b2c77-0000-4000-8000-000000000005",
    exceptionType: "RangeError",
    message: "Maximum call stack size exceeded",
    source: "render · storefront.tsx:19",
    sourceTitle: "storefront.tsx",
    service: "storefront-web",
    environment: "development",
    runtime: "Node 22.3.0",
    occurredAt: "2026-09-09T20:24:00.000Z",
    occurredLabel: "yesterday",
  }),
];

function idleFilters(): Pick<
  ReportsViewProps,
  | "environment"
  | "environmentOptions"
  | "onClearFilters"
  | "onEnvironmentChange"
  | "onQueryChange"
  | "onRefresh"
  | "onTagKeyChange"
  | "onTagValueChange"
  | "onUserIdChange"
  | "query"
  | "refreshing"
  | "setup"
  | "tagKey"
  | "tagValue"
  | "userId"
> {
  return {
    environment: "all",
    environmentOptions: ["development", "production", "staging"],
    onClearFilters: noop,
    onEnvironmentChange: noopOptionalString,
    onQueryChange: noopString,
    onRefresh: noop,
    onTagKeyChange: noopString,
    onTagValueChange: noopString,
    onUserIdChange: noopString,
    query: "",
    refreshing: false,
    setup: {
      checking: false,
      hasLiveToken: false,
      snippet: REPORTS_SETUP_SNIPPET,
      tokenHref: "/orgs/acme-payments/projects/checkout-api/tokens",
    },
    tagKey: "",
    tagValue: "",
    userId: "",
  };
}

/**
 * Named states for the Reports list.
 *
 * @remarks
 * The view is a public view: it receives rows and paints them. These
 * factories are the other composition root — the one a construction test
 * and a silhouette use instead of fetching from the API.
 *
 * `empty` is the ProjectSetup panel, not a generic "no rows" DataState:
 * a project with nothing in it is a project being wired up. `error` is
 * the load failure. Filter-only emptiness is a label change on the same
 * panel chrome and does not earn its own PNG.
 */
function empty(): ReportsViewProps {
  return {
    ...idleFilters(),
    reports: [],
    shownCount: 0,
    status: "empty",
    totalCount: 0,
  };
}

function populated(): ReportsViewProps {
  return {
    ...idleFilters(),
    reports: populatedRows,
    shownCount: populatedRows.length,
    status: "populated",
    totalCount: 24,
  };
}

function error(): ReportsViewProps {
  return {
    ...idleFilters(),
    errorDescription: "Something went wrong while loading error reports.",
    reports: [],
    shownCount: 0,
    status: "error",
    totalCount: 0,
  };
}

export const reportsViewStates = {
  empty,
  populated,
  error,
} as const;

export const reportsViewStateNames = ["empty", "populated", "error"] as const;

export type ReportsViewStateName = (typeof reportsViewStateNames)[number];

export function isReportsViewStateName(value: string | null): value is ReportsViewStateName {
  return value != null && (reportsViewStateNames as readonly string[]).includes(value);
}
