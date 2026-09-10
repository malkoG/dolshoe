import { attributeEntries } from "@dolshoe/ui/components/attribute-list";

import type { ErrorReportSummary } from "../../lib/error-reports";
import { formatRelativeTime } from "../../lib/format";
import type { ReportRowModel } from "./report-row";

const RUNTIME_DISPLAY_NAMES: Record<string, string> = {
  node: "Node",
  cpython: "Python",
  python: "Python",
  deno: "Deno",
  bun: "Bun",
};

export function formatRuntimeLabel(runtime: ErrorReportSummary["runtime"]): string {
  const family = RUNTIME_DISPLAY_NAMES[runtime.name.toLowerCase()] ?? runtime.name;
  return runtime.version ? `${family} ${runtime.version}` : family;
}

function fileBaseName(fileName: string): string {
  const segments = fileName.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? fileName;
}

export function formatSourceLocation(
  source: ErrorReportSummary["exception"]["source"],
): string | undefined {
  if (!source) return undefined;

  const place = source.fileName
    ? source.lineNumber !== undefined
      ? `${fileBaseName(source.fileName)}:${source.lineNumber}`
      : fileBaseName(source.fileName)
    : undefined;

  if (source.functionName && place) return `${source.functionName} · ${place}`;
  return source.functionName ?? place;
}

function tagEntries(report: ErrorReportSummary): Array<[string, string]> {
  const tags = attributeEntries(report.tags);
  if (report.service.release != null && !tags.some(([key]) => key === "release")) {
    tags.unshift(["release", report.service.release]);
  }
  return tags;
}

/** Turns a stored summary into the values `ReportRow` paints. */
export function toReportRow(report: ErrorReportSummary, href: string): ReportRowModel {
  return {
    id: report.id,
    href,
    exceptionType: report.exception.type ?? "Unknown exception",
    message: report.exception.message,
    source: formatSourceLocation(report.exception.source),
    sourceTitle: report.exception.source?.fileName,
    tags: tagEntries(report),
    service: report.service.name,
    environment: report.service.environment,
    runtime: formatRuntimeLabel(report.runtime),
    occurredAt: report.occurredAt,
    occurredLabel: formatRelativeTime(report.occurredAt),
  };
}

export function reportHref(
  orgSlug: string,
  projectId: string,
  reportId: string,
  search: { q?: string; env?: string; tagKey?: string; tagValue?: string; userId?: string },
): string {
  const parameters = new URLSearchParams();
  if (search.q != null) parameters.set("q", search.q);
  if (search.env != null) parameters.set("env", search.env);
  if (search.tagKey != null) parameters.set("tagKey", search.tagKey);
  if (search.tagValue != null) parameters.set("tagValue", search.tagValue);
  if (search.userId != null) parameters.set("userId", search.userId);
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  return `/orgs/${orgSlug}/projects/${projectId}/reports/${reportId}${query}`;
}
