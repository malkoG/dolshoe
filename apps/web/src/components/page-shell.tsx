import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  CircleAlert,
  Command,
  KeyRound,
  LogOut,
  ScrollText,
  Users,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";

import { initialsOf } from "../lib/format";
import type { Organization } from "../lib/organizations";
import type { Project } from "../lib/projects";
import { logout } from "../lib/session";
import type { Viewer } from "../lib/session";

/**
 * The chrome every page shares.
 *
 * @remarks
 * Navigation narrows from the outside in: the organization switcher picks a
 * tenant, the project switcher picks one of its projects, and the section links
 * below stay in view while you move between that project's reports, logs, and
 * tokens. `projects` is what the caller managed to load — an empty list simply
 * leaves the switcher out rather than blocking the page behind it.
 */
export function PageShell({
  activeProjectId,
  children,
  organizations = [],
  orgSlug,
  projects = [],
  viewer,
}: Readonly<{
  activeProjectId?: string;
  children: ReactNode;
  organizations?: Organization[];
  orgSlug: string;
  projects?: Project[];
  viewer?: Viewer;
}>) {
  const navigate = useNavigate();
  const router = useRouter();
  const inProject = projects.some((project) => project.id === activeProjectId);

  async function signOut(): Promise<void> {
    await logout();
    // Re-runs the root load, so the app forgets who this was before navigating.
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link
          className="brand"
          params={{ orgSlug }}
          to="/orgs/$orgSlug/projects"
          aria-label="Dolshoe home"
        >
          <img className="brand-mark" src="/dolshoe-mark-reversed.svg" alt="" />
          <span>dolshoe</span>
        </Link>

        <div className="switcher-stack">
          {/*
            Left out entirely for someone who only belongs to one organization:
            a switcher with a single option is a control that cannot do
            anything.
          */}
          {organizations.length > 1 && (
            <label className="org-switcher">
              <span className="sr-only">Switch organization</span>
              <select
                onChange={(event) =>
                  void navigate({
                    to: "/orgs/$orgSlug/projects",
                    params: { orgSlug: event.target.value },
                  })
                }
                value={orgSlug}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.slug}>
                    {organization.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="select-chevron" size={14} />
            </label>
          )}

          {/*
            Only rendered when the active project is actually one of the options.
            A select whose value matches nothing falls back to displaying the
            first option, which would name a project the page is not showing.
          */}
          {inProject && activeProjectId != null && (
            <label className="project-switcher">
              <span className="sr-only">Switch project</span>
              <select
                onChange={(event) =>
                  void navigate({
                    to: "/orgs/$orgSlug/projects/$projectId/reports",
                    params: { orgSlug, projectId: event.target.value },
                  })
                }
                value={activeProjectId}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="select-chevron" size={14} />
            </label>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {inProject && activeProjectId != null && (
            <>
              <span className="sidebar-heading">This project</span>
              <Link
                activeProps={{ className: "nav-link nav-link-active" }}
                className="nav-link"
                params={{ orgSlug, projectId: activeProjectId }}
                to="/orgs/$orgSlug/projects/$projectId/reports"
              >
                <CircleAlert size={16} />
                Reports
              </Link>
              <Link
                activeProps={{ className: "nav-link nav-link-active" }}
                className="nav-link"
                params={{ orgSlug, projectId: activeProjectId }}
                to="/orgs/$orgSlug/projects/$projectId/logs"
              >
                <ScrollText size={16} />
                Logs
              </Link>
              <Link
                activeProps={{ className: "nav-link nav-link-active" }}
                className="nav-link"
                params={{ orgSlug, projectId: activeProjectId }}
                to="/orgs/$orgSlug/projects/$projectId/traces"
              >
                <Waypoints size={16} />
                Traces
              </Link>
              <Link
                activeProps={{ className: "nav-link nav-link-active" }}
                className="nav-link"
                params={{ orgSlug, projectId: activeProjectId }}
                to="/orgs/$orgSlug/projects/$projectId/tokens"
              >
                <KeyRound size={16} />
                Tokens
              </Link>
              <span className="sidebar-divider" />
            </>
          )}

          <Link
            activeOptions={{ exact: true }}
            activeProps={{ className: "nav-link nav-link-active" }}
            className="nav-link"
            params={{ orgSlug }}
            to="/orgs/$orgSlug/projects"
          >
            <Boxes size={16} />
            All projects
          </Link>
          <Link
            activeOptions={{ exact: true }}
            activeProps={{ className: "nav-link nav-link-active" }}
            className="nav-link"
            params={{ orgSlug }}
            to="/orgs/$orgSlug/members"
          >
            <Users size={16} />
            Members
          </Link>
          <Link
            activeOptions={{ exact: true }}
            activeProps={{ className: "nav-link nav-link-active" }}
            className="nav-link"
            to="/orgs"
          >
            <Building2 size={16} />
            Organizations
          </Link>
        </nav>

        <div className="sidebar-footer">
          <button className="icon-button" type="button" aria-label="Open command menu">
            <Command size={16} />
          </button>
          <button
            className="icon-button notification-button"
            type="button"
            aria-label="Notifications"
          >
            <Bell size={16} />
            <span className="notification-dot" />
          </button>

          {/*
            A <details> rather than a popover library: it gives keyboard access
            and dismissal for free, and this menu holds three things.
          */}
          {viewer != null && (
            <details className="account-menu">
              <summary className="avatar" aria-label="Open account menu">
                {viewer.avatarUrl == null ? (
                  initialsOf(viewer.name)
                ) : (
                  // Decorative: the summary already carries the accessible name,
                  // and the label would otherwise be announced twice.
                  <img className="avatar-image" src={viewer.avatarUrl} alt="" />
                )}
              </summary>
              <div className="account-panel">
                <div className="account-identity">
                  <strong>{viewer.name}</strong>
                  <span>
                    {viewer.githubLogin == null ? viewer.email : `@${viewer.githubLogin}`}
                  </span>
                </div>
                <Link className="account-action" to="/orgs">
                  <Building2 size={14} />
                  Organizations
                </Link>
                <button className="account-action" onClick={() => void signOut()} type="button">
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </details>
          )}
        </div>
      </aside>

      <main className="workspace">{children}</main>
    </div>
  );
}
