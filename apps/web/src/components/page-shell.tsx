import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Boxes, ChevronDown, CircleAlert, Command, KeyRound, ScrollText } from "lucide-react";
import type { ReactNode } from "react";

import type { Project } from "../lib/projects";

/**
 * The chrome every page shares.
 *
 * @remarks
 * Navigation is project-first and lives in the sidebar: the switcher picks a
 * project, and the section links below it stay in view while you move between
 * that project's reports, logs, and tokens. `projects` is what the caller
 * managed to load — an empty list simply leaves the switcher out rather than
 * blocking the page behind it.
 */
export function PageShell({
  activeProjectId,
  children,
  projects = [],
}: Readonly<{
  activeProjectId?: string;
  children: ReactNode;
  projects?: Project[];
}>) {
  const navigate = useNavigate();
  const inProject = projects.some((project) => project.id === activeProjectId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/projects" aria-label="Dolshoe home">
          <img className="brand-mark" src="/dolshoe-mark-reversed.svg" alt="" />
          <span>dolshoe</span>
        </Link>

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
                  to: "/projects/$projectId/reports",
                  params: { projectId: event.target.value },
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

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {inProject && activeProjectId != null && (
            <>
              <span className="sidebar-heading">This project</span>
              <Link
                activeProps={{ className: "nav-link nav-link-active" }}
                className="nav-link"
                params={{ projectId: activeProjectId }}
                to="/projects/$projectId/reports"
              >
                <CircleAlert size={16} />
                Reports
              </Link>
              <Link
                activeProps={{ className: "nav-link nav-link-active" }}
                className="nav-link"
                params={{ projectId: activeProjectId }}
                to="/projects/$projectId/logs"
              >
                <ScrollText size={16} />
                Logs
              </Link>
              <Link
                activeProps={{ className: "nav-link nav-link-active" }}
                className="nav-link"
                params={{ projectId: activeProjectId }}
                to="/projects/$projectId/tokens"
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
            to="/projects"
          >
            <Boxes size={16} />
            All projects
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
          <button className="avatar" type="button" aria-label="Open account menu">
            KW
          </button>
        </div>
      </aside>

      <main className="workspace">{children}</main>
    </div>
  );
}
