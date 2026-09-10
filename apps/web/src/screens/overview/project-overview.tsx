import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";

import { ProjectDashboardOverview } from "../../components/project-dashboard-overview";
import type { ProjectDashboardSummary } from "../../lib/dashboard-summary";
import { OverviewSidebar, OverviewTopBar } from "./chrome";
import type { OverviewChrome } from "./chrome";

export type { OverviewChrome };

export type ProjectOverviewBodyState =
  | { status: "loading" }
  | { status: "error"; description: string; onRetry?: () => void }
  | { status: "ready"; summary: ProjectDashboardSummary };

export interface ProjectOverviewProps {
  chrome: OverviewChrome;
  body: ProjectOverviewBodyState;
}

/**
 * The dashboard slot under the heading: a resolved summary, or the DataState
 * the route shows before one arrives.
 *
 * @remarks
 * The frozen project layout already paints PageShell and the slug/name
 * heading. This is what the overview route mounts — not a second sidebar.
 */
export function ProjectOverviewBody({ body }: Readonly<{ body: ProjectOverviewBodyState }>) {
  if (body.status === "loading") {
    return (
      <DataState
        description="Fetching this project's recent activity."
        kind="loading"
        title="Loading dashboard…"
      />
    );
  }

  if (body.status === "error") {
    return (
      <DataState
        description={body.description}
        kind="error"
        onRetry={body.onRetry}
        title="Couldn't load the dashboard"
      />
    );
  }

  return <ProjectDashboardOverview summary={body.summary} />;
}

/**
 * Figma 20 — Project · Overview as a public view.
 *
 * @remarks
 * Receives chrome labels and a body state. It does not fetch. A construction
 * test and a silhouette inject a named factory; the overview route is the
 * other composition root and mounts only `ProjectOverviewBody`, because the
 * shared project layout is frozen.
 */
export function ProjectOverview({ body, chrome }: ProjectOverviewProps) {
  return (
    <div className="flex h-[960px] w-[1440px] overflow-hidden bg-background">
      <OverviewSidebar chrome={chrome} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OverviewTopBar chrome={chrome} />
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-9 pt-[52px] pb-[52px]">
          <PageHeading className="mb-0">Overview</PageHeading>
          <ProjectOverviewBody body={body} />
        </main>
      </div>
    </div>
  );
}
