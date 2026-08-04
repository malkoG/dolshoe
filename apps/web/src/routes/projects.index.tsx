import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Boxes, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { PageShell } from "../components/page-shell";
import { ApiError } from "../lib/api-request";
import { dateFormatter } from "../lib/format";
import { createProject, fetchProjects } from "../lib/projects";
import type { Project } from "../lib/projects";

export const Route = createFileRoute("/projects/")({ component: Projects });

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; projects: Project[] };

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading projects.";
}

function Projects() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchProjects({ signal: controller.signal })
      .then((projects) => {
        if (!cancelled) setState({ status: "ready", projects });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadToken]);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (creating || name.trim().length === 0) return;

    setCreating(true);
    setCreateError(undefined);
    try {
      await createProject({ name: name.trim() });
      setName("");
      setReloadToken((token) => token + 1);
    } catch (error) {
      // A taken slug is the one failure the operator can fix inline, so it is
      // reported on the field rather than as a page-level error.
      setCreateError(
        error instanceof ApiError && error.status === 409
          ? "A project with that slug already exists. Try a different name."
          : describeError(error),
      );
    } finally {
      setCreating(false);
    }
  }

  const projects = state.status === "ready" ? state.projects : [];

  return (
    <PageShell projects={projects}>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <Boxes size={13} />
            One token set per project
          </div>
          <h1>Projects</h1>
          <p>
            A project owns the ingestion tokens your applications report with, and every event those
            tokens deliver.
          </p>
        </div>
      </section>

      <section className="report-panel">
        <div className="filter-bar">
          <span className="filter-summary">
            {state.status === "ready"
              ? `${projects.length} ${projects.length === 1 ? "project" : "projects"}`
              : "Projects"}
          </span>

          <form className="inline-form" onSubmit={submit}>
            <label className="search-field">
              <span className="sr-only">New project name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder="New project name…"
                type="text"
                value={name}
              />
            </label>
            <button className="primary-button" disabled={creating} type="submit">
              {creating ? <Loader2 className="spin" size={13} /> : <Plus size={13} />}
              Create project
            </button>
          </form>
        </div>

        {createError && (
          <p className="field-error" role="alert">
            {createError}
          </p>
        )}

        <div className="project-list" aria-live="polite">
          {state.status === "loading" && (
            <div className="state-panel state-panel-loading" role="status">
              <span className="state-icon">
                <Loader2 className="spin" size={19} />
              </span>
              <strong>Loading projects…</strong>
              <p>Fetching them from the API.</p>
            </div>
          )}

          {state.status === "error" && (
            <div className="state-panel state-panel-error" role="alert">
              <span className="state-icon">
                <AlertTriangle size={19} />
              </span>
              <strong>Couldn't load projects</strong>
              <p>{describeError(state.error)}</p>
              <button onClick={() => setReloadToken((token) => token + 1)} type="button">
                <RefreshCw size={13} />
                Try again
              </button>
            </div>
          )}

          {state.status === "ready" && projects.length === 0 && (
            <div className="state-panel">
              <span className="state-icon">
                <Boxes size={19} />
              </span>
              <strong>No projects yet</strong>
              <p>Create one, issue it a token, and point a reporter at the DSN it gives you.</p>
            </div>
          )}

          {state.status === "ready" &&
            projects.map((project) => (
              <Link
                className="project-row"
                key={project.id}
                params={{ projectId: project.id }}
                to="/projects/$projectId/reports"
              >
                <div>
                  <strong>{project.name}</strong>
                  <span className="project-slug">{project.slug}</span>
                </div>
                <span className="project-created">
                  Created {dateFormatter.format(new Date(project.createdAt))}
                </span>
                <ChevronRight className="project-chevron" size={15} />
              </Link>
            ))}
        </div>
      </section>
    </PageShell>
  );
}
