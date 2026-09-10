import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import {
  Panel,
  PanelBar,
  PanelControls,
  PanelFooter,
  PanelFooterNote,
  PanelListHeader,
  PanelSummary,
} from "@dolshoe/ui/components/panel";
import { SearchField } from "@dolshoe/ui/components/search-field";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
import { Search } from "lucide-react";

import { RefreshButton } from "../../components/refresh-button";
import { pluralize } from "../../lib/format";
import { ReportRow } from "./report-row";
import type { ReportRowModel } from "./report-row";
import { ReportsSetup } from "./reports-setup";
import type { ReportsSetupProps } from "./reports-setup";

export type ReportsViewStatus = "loading" | "error" | "empty" | "no-match" | "populated";

export interface ReportsViewProps {
  environment: string;
  environmentOptions: readonly string[];
  errorDescription?: string;
  onClearFilters?: () => void;
  onEnvironmentChange: (value: string | undefined) => void;
  onOpenReport?: (reportId: string) => void;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  onTagKeyChange: (value: string) => void;
  onTagValueChange: (value: string) => void;
  onUserIdChange: (value: string) => void;
  query: string;
  refreshing: boolean;
  reports: readonly ReportRowModel[];
  setup: ReportsSetupProps;
  shownCount: number;
  status: ReportsViewStatus;
  tagKey: string;
  tagValue: string;
  totalCount: number;
  userId: string;
}

function ReportsFilters({
  environment,
  environmentOptions,
  onEnvironmentChange,
  onQueryChange,
  onRefresh,
  onTagKeyChange,
  onTagValueChange,
  onUserIdChange,
  query,
  refreshing,
  shownCount,
  status,
  tagKey,
  tagValue,
  userId,
}: Readonly<
  Pick<
    ReportsViewProps,
    | "environment"
    | "environmentOptions"
    | "onEnvironmentChange"
    | "onQueryChange"
    | "onRefresh"
    | "onTagKeyChange"
    | "onTagValueChange"
    | "onUserIdChange"
    | "query"
    | "refreshing"
    | "status"
    | "tagKey"
    | "tagValue"
    | "userId"
  > & { shownCount: number }
>) {
  return (
    <PanelBar>
      <PanelSummary>
        {status === "populated" || status === "no-match"
          ? pluralize(shownCount, "report")
          : "Reports"}
      </PanelSummary>

      <PanelControls>
        <SearchField
          label="Search reports"
          onValueChange={onQueryChange}
          placeholder="Search errors, services…"
          value={query}
        />

        <Select
          onValueChange={(value) => onEnvironmentChange(value === "all" ? undefined : value)}
          value={environment}
        >
          <SelectTrigger aria-label="Filter by environment" className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            {environmentOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            aria-label="Filter by tag key"
            className="h-8 w-[100px] font-mono text-mono"
            onChange={(event) => onTagKeyChange(event.target.value)}
            placeholder="tag key"
            value={tagKey}
          />
          <span aria-hidden="true" className="font-mono text-mono text-faint">
            :
          </span>
          <Input
            aria-label="Filter by tag value"
            className="h-8 w-[100px] font-mono text-mono"
            onChange={(event) => onTagValueChange(event.target.value)}
            placeholder="value"
            value={tagValue}
          />
        </div>

        <Input
          aria-label="Filter by user id"
          className="h-8 w-[140px] font-mono text-mono"
          onChange={(event) => onUserIdChange(event.target.value)}
          placeholder="user id"
          value={userId}
        />

        <RefreshButton
          label="Check for new reports"
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      </PanelControls>
    </PanelBar>
  );
}

/**
 * A project's Reports screen.
 *
 * @remarks
 * This is the public view: it receives values and paints them. The route is
 * the composition root that fetches; a construction test and a silhouette
 * are the other one. The live chrome stays in `PageShell`. Named states wrap
 * this view in the private `ReportsChrome` stub so Sidebar + TopBar + body
 * are in the PNG without pulling shared layout into the route.
 */
export function ReportsView({
  environment,
  environmentOptions,
  errorDescription,
  onClearFilters,
  onEnvironmentChange,
  onOpenReport,
  onQueryChange,
  onRefresh,
  onTagKeyChange,
  onTagValueChange,
  onUserIdChange,
  query,
  refreshing,
  reports,
  setup,
  shownCount,
  status,
  tagKey,
  tagValue,
  totalCount,
  userId,
}: Readonly<ReportsViewProps>) {
  return (
    <div>
      <PageHeading>Reports</PageHeading>

      {status === "empty" ? (
        <ReportsSetup {...setup} />
      ) : (
        <Panel>
          <ReportsFilters
            environment={environment}
            environmentOptions={environmentOptions}
            onEnvironmentChange={onEnvironmentChange}
            onQueryChange={onQueryChange}
            onRefresh={onRefresh}
            onTagKeyChange={onTagKeyChange}
            onTagValueChange={onTagValueChange}
            onUserIdChange={onUserIdChange}
            query={query}
            refreshing={refreshing}
            shownCount={shownCount}
            status={status}
            tagKey={tagKey}
            tagValue={tagValue}
            userId={userId}
          />

          <div aria-live="polite">
            {status === "loading" && (
              <DataState
                description="Fetching the newest events from the API."
                kind="loading"
                title="Loading error reports…"
              />
            )}

            {status === "error" && (
              <DataState
                description={
                  errorDescription ?? "Something went wrong while loading error reports."
                }
                kind="error"
                onRetry={onRefresh}
                title="Couldn't load error reports"
              />
            )}

            {status === "no-match" && (
              <DataState
                action={
                  onClearFilters != null && (
                    <Button onClick={onClearFilters} size="sm" type="button" variant="outline">
                      Clear all filters
                    </Button>
                  )
                }
                description="Try another search or clear your active filters."
                icon={Search}
                kind="empty"
                title="No matching reports"
              />
            )}

            {status === "populated" && (
              <>
                <PanelListHeader className="hidden gap-4 md:flex">
                  <span className="min-w-0 flex-1">Issue</span>
                  <span className="hidden w-[240px] shrink-0 md:block">Service</span>
                  <span className="hidden w-[130px] shrink-0 lg:block">Occurred</span>
                  <span className="hidden w-[100px] shrink-0 lg:block">Report</span>
                </PanelListHeader>
                <ul>
                  {reports.map((report) => (
                    <ReportRow
                      key={report.id}
                      onOpen={onOpenReport == null ? undefined : () => onOpenReport(report.id)}
                      report={report}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>

          {(status === "populated" || status === "no-match") && (
            <PanelFooter>
              <span>
                Showing <strong className="font-semibold text-foreground">{shownCount}</strong> of{" "}
                {totalCount} reports
              </span>
              <PanelFooterNote>Sorted newest first</PanelFooterNote>
            </PanelFooter>
          )}
        </Panel>
      )}
    </div>
  );
}
