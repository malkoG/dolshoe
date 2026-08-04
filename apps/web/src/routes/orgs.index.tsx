import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Boxes, Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api-request";
import { dateFormatter } from "../lib/format";
import { createOrganization } from "../lib/organizations";

export const Route = createFileRoute("/orgs/")({
  beforeLoad: ({ context, location }) => {
    if (context.session.viewer == null) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: Organizations,
});

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while creating the organization.";
}

function Organizations() {
  const router = useRouter();
  // Already loaded by the root route, so this page needs no request of its own.
  const { organizations } = Route.useRouteContext().session;
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (creating || name.trim().length === 0) return;

    setCreating(true);
    setError(undefined);
    try {
      const created = await createOrganization({ name: name.trim() });
      await router.invalidate();
      await router.navigate({
        to: "/orgs/$orgSlug/projects",
        params: { orgSlug: created.slug },
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? "An organization with that slug already exists. Try a different name."
          : describeError(cause),
      );
      setCreating(false);
    }
  }

  return (
    <main className="centered-shell">
      <section className="page-heading">
        <div>
          <div className="eyebrow">Organizations</div>
          <h1>Where your projects live</h1>
        </div>
      </section>

      <section className="report-panel">
        {organizations.length === 0 ? (
          <div className="state-panel" role="status">
            <span className="state-icon">
              <Boxes size={19} />
            </span>
            <strong>You are not in an organization yet</strong>
            <p>Create one below to start collecting error reports and logs.</p>
          </div>
        ) : (
          <ul className="organization-list">
            {organizations.map((organization) => (
              <li key={organization.id}>
                <Link
                  params={{ orgSlug: organization.slug }}
                  to="/orgs/$orgSlug/projects"
                  className="organization-row"
                >
                  <div>
                    <strong>{organization.name}</strong>
                    <span className="organization-slug">{organization.slug}</span>
                  </div>
                  <div className="organization-meta">
                    <span className="role-badge">{organization.role.toLowerCase()}</span>
                    <span>Created {dateFormatter.format(new Date(organization.createdAt))}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="report-panel">
        <form className="inline-form" onSubmit={(event) => void submit(event)}>
          <label className="auth-field">
            <span>New organization</span>
            <input
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Payments"
              type="text"
              value={name}
            />
          </label>
          <button className="primary-button" disabled={creating} type="submit">
            {creating ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
            Create
          </button>
        </form>
        {error != null && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
