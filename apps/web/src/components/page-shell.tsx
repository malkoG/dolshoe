import { Link } from "@tanstack/react-router";
import { Activity, Bell, Boxes, CircleAlert, Command } from "lucide-react";
import type { ReactNode } from "react";

type NavSection = "reports" | "projects";

function navLinkClass(section: NavSection, active: NavSection): string {
  return section === active ? "nav-link nav-link-active" : "nav-link";
}

/**
 * The chrome every page shares: brand, primary navigation, and account actions.
 * Pages own everything inside `<main>`.
 */
export function PageShell({
  active,
  children,
}: Readonly<{ active: NavSection; children: ReactNode }>) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Dolshoe home">
          <img className="brand-mark" src="/dolshoe-mark-reversed.svg" alt="" />
          <span>dolshoe</span>
        </Link>

        <nav className="topnav" aria-label="Primary navigation">
          <Link
            className={navLinkClass("reports", active)}
            to="/"
            {...(active === "reports" ? { "aria-current": "page" as const } : {})}
          >
            <CircleAlert size={16} />
            Reports
          </Link>
          <Link
            className={navLinkClass("projects", active)}
            to="/projects"
            {...(active === "projects" ? { "aria-current": "page" as const } : {})}
          >
            <Boxes size={16} />
            Projects
          </Link>
          <a className="nav-link" href="#activity">
            <Activity size={16} />
            Activity
          </a>
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
