import { ListRow } from "@dolshoe/ui/components/list-row";
import { StatusDot } from "@dolshoe/ui/components/status-badge";
import { Clock3 } from "lucide-react";
import type { MouseEvent } from "react";

import { formatShortId } from "../../lib/format";

/** Which environments get a colour of their own, and which stay deliberately grey. */
export const ENVIRONMENT_TONES: Record<string, "success" | "violet"> = {
  production: "success",
  staging: "violet",
};

export interface ReportRowModel {
  id: string;
  href: string;
  exceptionType: string;
  message?: string;
  source?: string;
  sourceTitle?: string;
  tags: ReadonlyArray<readonly [string, string]>;
  service: string;
  environment?: string;
  runtime: string;
  occurredAt: string;
  occurredLabel: string;
}

function environmentTone(environment: string | undefined): "success" | "violet" | "neutral" {
  if (environment == null) return "neutral";
  return ENVIRONMENT_TONES[environment] ?? "neutral";
}

function openReportClick(
  event: MouseEvent<HTMLAnchorElement>,
  onOpen: (() => void) | undefined,
): void {
  if (
    onOpen == null ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  ) {
    return;
  }

  event.preventDefault();
  onOpen();
}

function TagPills({ tags }: Readonly<{ tags: ReportRowModel["tags"] }>) {
  if (tags.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {tags.map(([key, value]) => (
        <span
          className="inline-flex max-w-full items-center gap-1 truncate rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-mono"
          key={key}
        >
          <span className="text-faint">{key}</span>
          <span className="text-faint">=</span>
          <span className="text-foreground">{value}</span>
        </span>
      ))}
    </div>
  );
}

function EnvironmentLine({
  environment,
  runtime,
}: Readonly<{ environment?: string; runtime: string }>) {
  return (
    <div className="flex items-center gap-1 font-mono text-mono text-muted-foreground">
      <StatusDot tone={environmentTone(environment)} />
      <span className="truncate">{environment ?? "Unspecified environment"}</span>
      <span aria-hidden="true" className="font-sans text-meta text-faint">
        ·
      </span>
      <span className="truncate">{runtime}</span>
    </div>
  );
}

/**
 * One report in the list.
 *
 * @remarks
 * A private copy of the Figma `ReportRow` rather than a `@dolshoe/ui` primitive:
 * this screen is the first caller, and extracting it would be a shared layout
 * change this pass is not allowed to make. Comfortable is the md+ four-column
 * table; below that the service, time, and id restated under the issue so they
 * are not simply lost.
 */
export function ReportRow({
  onOpen,
  report,
}: Readonly<{
  onOpen?: () => void;
  report: ReportRowModel;
}>) {
  return (
    <ListRow>
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/*
            The whole heading is the target rather than a separate "view"
            affordance in a fifth column: the exception's name is what a
            reader is already aiming at.
          */}
          <a
            className="truncate text-body font-semibold text-foreground hover:underline"
            href={report.href}
            onClick={(event) => openReportClick(event, onOpen)}
          >
            {report.exceptionType}
          </a>
          {report.message != null && (
            <p className="line-clamp-2 text-body text-muted-foreground">{report.message}</p>
          )}
          {report.source != null && (
            <span className="truncate font-mono text-mono text-faint" title={report.sourceTitle}>
              {report.source}
            </span>
          )}
          <TagPills tags={report.tags} />
          <span className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-mono text-muted-foreground md:hidden">
            <strong className="font-sans text-meta font-semibold text-foreground">
              {report.service}
            </strong>
            <StatusDot tone={environmentTone(report.environment)} />
            {report.environment ?? "Unspecified environment"}
            <span aria-hidden="true">·</span>
            <time dateTime={report.occurredAt}>{report.occurredLabel}</time>
          </span>
        </div>

        <div className="hidden w-[240px] shrink-0 flex-col gap-1 overflow-clip md:flex">
          <p className="truncate text-meta font-semibold">{report.service}</p>
          <EnvironmentLine environment={report.environment} runtime={report.runtime} />
        </div>

        <div className="hidden w-[130px] shrink-0 items-center gap-1 overflow-clip lg:flex">
          <Clock3 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <time
            className="truncate text-meta text-muted-foreground"
            dateTime={report.occurredAt}
            title={report.occurredAt}
          >
            {report.occurredLabel}
          </time>
        </div>

        <div className="hidden w-[100px] shrink-0 items-center overflow-clip lg:flex">
          <span className="truncate font-mono text-mono text-faint" title={report.id}>
            #{formatShortId(report.id)}
          </span>
        </div>
      </div>
    </ListRow>
  );
}
