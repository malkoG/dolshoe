import { DataState } from "@dolshoe/ui/components/data-state";
import { ListRow, ListRowLink, ListRowMain, ListRowMeta } from "@dolshoe/ui/components/list-row";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel, PanelBar, PanelControls, PanelSummary } from "@dolshoe/ui/components/panel";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { cn } from "@dolshoe/ui/lib/utils";
import { Boxes, ChevronRight, Plus } from "lucide-react";

import { dateFormatter, pluralize } from "../../lib/format";

/**
 * Organization projects: heading and the list.
 *
 * @remarks
 * A public view. It receives values and paints them. The live route mounts
 * this under `PageShell`. Named-state silhouettes mount `OrgProjectsReview`
 * so they photograph the private chrome too.
 */

export type OrgMarkTone = "brand" | "info" | "identity" | "violet" | "success";

export type MembershipRoleLabel = "owner" | "admin" | "member";

export interface OrgProjectsOrganization {
  href: string;
  initial: string;
  markTone: OrgMarkTone;
  name: string;
  role: MembershipRoleLabel;
  slug: string;
}

export interface OrgProjectsViewer {
  avatarUrl?: string;
  handle: string;
  initials: string;
  name: string;
}

export interface OrgProjectsProjectItem {
  createdAt: string;
  href: string;
  id: string;
  name: string;
  slug: string;
}

export interface OrgProjectsHrefs {
  members: string;
  organizations: string;
  projects: string;
  settings: string;
}

export interface OrgProjectsCreate {
  error?: string;
  name: string;
  onNameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  submitting: boolean;
}

export type OrgProjectsList =
  | { status: "loading" }
  | { description: string; onRetry: () => void; status: "error" }
  | { projects: OrgProjectsProjectItem[]; status: "ready" };

export interface OrgProjectsProps {
  create?: OrgProjectsCreate;
  density?: "comfortable" | "compact";
  frame?: "page" | "1440" | "1024";
  hrefs: OrgProjectsHrefs;
  list: OrgProjectsList;
  onSignOut?: () => void;
  organization: OrgProjectsOrganization;
  organizations: OrgProjectsOrganization[];
  orgMenuOpen?: boolean;
  viewer: OrgProjectsViewer;
}

export function OrgProjects({
  create,
  density = "comfortable",
  list,
}: Pick<OrgProjectsProps, "create" | "density" | "list">) {
  const projects = list.status === "ready" ? list.projects : [];
  const compact = density === "compact";

  return (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-6")}>
      <PageHeading
        className="mb-0"
        description="A project owns the ingestion tokens your applications report with, and every event those tokens deliver."
        eyebrow="One token set per project"
      >
        Projects
      </PageHeading>

      <Panel className={compact ? "shadow-none" : undefined}>
        <PanelBar>
          <PanelSummary>
            {list.status === "ready" && projects.length > 0
              ? pluralize(projects.length, "project")
              : "Projects"}
          </PanelSummary>
          {create != null && (
            <PanelControls>
              <form className="flex flex-wrap items-center gap-2" onSubmit={create.onSubmit}>
                <Label className="sr-only" htmlFor="project-name">
                  New project name
                </Label>
                <Input
                  className={compact ? "h-8 w-[200px]" : "w-full sm:w-[230px]"}
                  id="project-name"
                  onChange={(event) => create.onNameChange(event.target.value)}
                  placeholder="New project name…"
                  type="text"
                  value={create.name}
                />
                <Button
                  disabled={create.submitting}
                  size={compact ? "sm" : "default"}
                  type="submit"
                >
                  {create.submitting ? <Spinner /> : compact ? null : <Plus />}
                  Create project
                </Button>
              </form>
            </PanelControls>
          )}
        </PanelBar>

        {create?.error != null && (
          <p
            className="border-b border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
            role="alert"
          >
            {create.error}
          </p>
        )}

        <div aria-live="polite">
          {list.status === "loading" && (
            <DataState
              description="Fetching them from the API."
              kind="loading"
              title="Loading projects…"
            />
          )}

          {list.status === "error" && (
            <DataState
              description={list.description}
              kind="error"
              onRetry={list.onRetry}
              title="Couldn't load projects"
            />
          )}

          {list.status === "ready" && projects.length === 0 && (
            <DataState
              description="Create one, issue it a token, and point a reporter at the DSN it gives you."
              icon={Boxes}
              kind="empty"
              title="No projects yet"
            />
          )}

          {list.status === "ready" && projects.length > 0 && (
            <ul>
              {projects.map((project) => (
                <ListRow key={project.id}>
                  <ListRowLink asChild density="compact">
                    <a href={project.href}>
                      <ListRowMain className="flex min-w-[240px] flex-1 items-center gap-2">
                        <strong className="max-w-[320px] truncate font-semibold">
                          {project.name}
                        </strong>
                        <span className="min-w-0 truncate font-mono text-faint">
                          {project.slug}
                        </span>
                      </ListRowMain>
                      <ListRowMeta className="gap-3">
                        <span className="text-muted-foreground">
                          Created {dateFormatter.format(new Date(project.createdAt))}
                        </span>
                        <ChevronRight className="size-3.5 shrink-0 text-faint" />
                      </ListRowMeta>
                    </a>
                  </ListRowLink>
                </ListRow>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
