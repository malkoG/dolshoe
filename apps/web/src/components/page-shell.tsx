import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Boxes, ChevronDown, Command } from "lucide-react";
import type { ReactNode } from "react";

import type { Project } from "../lib/projects";

/**
 * The chrome every page shares.
 *
 * @remarks
 * Navigation is project-first: the top bar switches projects, and each project
 * page carries its own Reports / Logs / Tokens tabs. `projects` is what the
 * caller has managed to load — an empty list simply leaves the switcher out
 * rather than blocking the page behind it.
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/projects" aria-label="Dolshoe home">
          <img className="brand-mark" src="/dolshoe-mark-reversed.svg" alt="" />
          <span>dolshoe</span>
        </Link>

        <nav className="topnav" aria-label="Primary navigation">
          <Link className="nav-link" to="/projects">
            <Boxes size={16} />
            Projects
          </Link>

          {/*
            Only shown when the active project is actually one of the options.
            A select whose value matches nothing falls back to displaying the
            first option, which would name a project the page is not showing.
          */}
          {projects.some((project) => project.id === activeProjectId) && (
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
        </nav>

        <div className="topbar-actions">
          <button className="icon-button" type="button" aria-label="Open command menu">
            <Command size={17} />
          </button>
          <button
            className="icon-button notification-button"
            type="button"
            aria-label="Notifications"
          >
            <Bell size={17} />
            <span className="notification-dot" />
          </button>
          <button className="avatar" type="button" aria-label="Open account menu">
            KW
          </button>
        </div>
      </header>

      <main className="workspace">{children}</main>
    </div>
  );
}
