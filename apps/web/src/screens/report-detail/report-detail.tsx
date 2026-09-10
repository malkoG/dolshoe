import { AttributeList, attributeEntries } from "@dolshoe/ui/components/attribute-list";
import { BreadcrumbTimeline } from "@dolshoe/ui/components/breadcrumb-timeline";
import { DataState } from "@dolshoe/ui/components/data-state";
import { Panel, PanelBar, PanelControls, PanelFooter } from "@dolshoe/ui/components/panel";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Clock3 } from "lucide-react";
import type { ReactNode } from "react";

import { ExceptionTree } from "../../components/exception-tree";
import type { ErrorReportDetail, UserContext } from "../../lib/error-reports";
import { formatRelativeTime, formatShortId } from "../../lib/format";
import type { ReportDetailChrome } from "./chrome";
import { ReportDetailFrame } from "./chrome";

const SECTION_LABEL_CLASS = "mb-2 font-mono text-[9px] tracking-[0.08em] text-faint uppercase";

const RUNTIME_DISPLAY_NAMES: Record<string, string> = {
  node: "Node",
  cpython: "Python",
  python: "Python",
  deno: "Deno",
  bun: "Bun",
};

/** Whichever of id/email/username the reporter gave is most worth showing first. */
export function describeUser(user: NonNullable<UserContext>): string {
  return user.username ?? user.email ?? user.id ?? "";
}

export function formatRuntimeLabel(runtime: ErrorReportDetail["runtime"]): string {
  const family = RUNTIME_DISPLAY_NAMES[runtime.name.toLowerCase()] ?? runtime.name;
  return runtime.version == null ? family : `${family} ${runtime.version}`;
}

export function reporterLabel(reporter: ErrorReportDetail["reporter"]): string {
  return reporter.version == null ? reporter.name : `${reporter.name} ${reporter.version}`;
}

export type ReportDetailStatus = "loading" | "error" | "ready";

/**
 * The report panel — values on screen, no session and no fetch.
 *
 * @remarks
 * The live route still sits inside PageShell, so it mounts this panel and
 * not the page chrome. The silhouette mounts {@link ReportDetail}, which
 * wraps the same panel in this screen's private stubs.
 */
export interface ReportDetailPanelProps {
  status: ReportDetailStatus;
  report?: ErrorReportDetail;
  errorDescription?: string;
  onRetry?: () => void;
  back?: ReactNode;
  /** Already resolved — the view does not know the route table. */
  trace?: { href: string; label: string };
}

export function ReportDetailPanel({
  back,
  errorDescription,
  onRetry,
  report,
  status,
  trace,
}: ReportDetailPanelProps) {
  return (
    <Panel>
      {(back != null || report != null) && (
        <PanelBar>
          {back}

          {report != null && (
            <PanelControls className="gap-2 text-[12px] text-muted-foreground">
              <span className="font-semibold">{report.service.name}</span>
              {report.service.environment != null && (
                <StatusBadge>{report.service.environment}</StatusBadge>
              )}
              <span aria-hidden="true" className="text-faint">
                ·
              </span>
              {formatRuntimeLabel(report.runtime)}
              {report.user != null && (
                <>
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
                  <span className="font-mono">{describeUser(report.user)}</span>
                </>
              )}
              <span className="flex items-center gap-1.5">
                <Clock3 aria-hidden="true" className="size-3.5" />
                <time dateTime={report.occurredAt} title={report.occurredAt}>
                  {formatRelativeTime(report.occurredAt)}
                </time>
              </span>
            </PanelControls>
          )}
        </PanelBar>
      )}

      <div aria-live="polite">
        {status === "loading" && (
          <DataState
            kind="loading"
            title="Loading the report…"
            description="Fetching the stored exception and its frames."
          />
        )}

        {status === "error" && (
          <DataState
            kind="error"
            title="Couldn't load this report"
            description={errorDescription ?? "Something went wrong while loading it."}
            onRetry={onRetry}
          />
        )}

        {report != null && <ExceptionTree exception={report.exception} />}

        {report?.tags != null && Object.keys(report.tags).length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <p className={SECTION_LABEL_CLASS}>Tags</p>
            <AttributeList background="muted" entries={Object.entries(report.tags)} />
          </div>
        )}

        {attributeEntries(report?.attributes).length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <p className={SECTION_LABEL_CLASS}>Attributes</p>
            <AttributeList background="muted" entries={attributeEntries(report?.attributes)} />
          </div>
        )}

        {report?.breadcrumbs != null && report.breadcrumbs.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <p className={SECTION_LABEL_CLASS}>Breadcrumbs</p>
            <BreadcrumbTimeline
              entries={report.breadcrumbs.map((breadcrumb) => ({
                ...breadcrumb,
                timestamp: formatRelativeTime(breadcrumb.timestamp),
              }))}
            />
          </div>
        )}
      </div>

      {report != null && (
        <PanelFooter>
          <span className="flex flex-wrap items-center gap-2">
            Reported by{" "}
            <strong className="font-semibold text-foreground">
              {reporterLabel(report.reporter)}
            </strong>
            {report.mechanism != null && (
              <>
                <span aria-hidden="true" className="text-faint">
                  ·
                </span>
                <code className="font-mono text-[12px]">{report.mechanism.type}</code>
                {report.mechanism.handled === false && " (unhandled)"}
              </>
            )}
            {trace != null && (
              <>
                <span aria-hidden="true" className="text-faint">
                  ·
                </span>
                <a className="font-semibold text-brand" href={trace.href}>
                  {trace.label}
                </a>
              </>
            )}
          </span>
          <span className="font-mono text-[12px] text-faint" title={report.id}>
            #{formatShortId(report.id)}
          </span>
        </PanelFooter>
      )}
    </Panel>
  );
}

export interface ReportDetailProps extends ReportDetailPanelProps {
  chrome: ReportDetailChrome;
}

/**
 * Figma screen 22 — Project · Report detail.
 *
 * @remarks
 * The public view a construction test and a silhouette photograph. It is the
 * full page, including chrome the live route does not mount (PageShell still
 * does that job). Both composition roots feed {@link ReportDetailPanel} the
 * same report props.
 */
export function ReportDetail({ chrome, ...panel }: ReportDetailProps) {
  return (
    <ReportDetailFrame chrome={chrome}>
      <ReportDetailPanel {...panel} />
    </ReportDetailFrame>
  );
}
