import { DataState } from "@dolshoe/ui/components/data-state";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel } from "@dolshoe/ui/components/panel";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Boxes, LogOut, Plus } from "lucide-react";
import { useState } from "react";

import { ApiError, describeError } from "../lib/api-request";
import { dateFormatter } from "../lib/format";
import { createOrganization } from "../lib/organizations";
import { useSignOut } from "../lib/use-sign-out";

export const Route = createFileRoute("/orgs/")({
  beforeLoad: ({ context, location }) => {
    if (context.session.viewer == null) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: Organizations,
});

function Organizations() {
  const router = useRouter();
  const signOut = useSignOut();
  // Already loaded by the root route, so this page needs no request of its own.
  const { organizations } = Route.useRouteContext().session;
  const first = organizations[0];
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
          : describeError(cause, "Something went wrong while creating the organization."),
      );
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 md:py-16">
      {/*
        This screen sits outside the application chrome, which left the two ways
        off it — back into the app, and out of the session — with nothing to
        reach them by. Somebody who belongs to no organization yet had neither,
        and the only exit was the browser's own.
      */}
      <div className="mb-6 flex items-center justify-between gap-3">
        {first == null ? (
          <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-[-0.03em]">
            <img className="size-7" src="/dolshoe-mark.svg" alt="" />
            dolshoe
          </span>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link params={{ orgSlug: first.slug }} to="/orgs/$orgSlug/projects">
              <ArrowLeft />
              Back to {first.name}
            </Link>
          </Button>
        )}

        <Button onClick={() => void signOut()} size="sm" type="button" variant="ghost">
          <LogOut />
          Sign out
        </Button>
      </div>

      <PageHeading eyebrow="Organizations">Where your projects live</PageHeading>

      <Panel>
        {organizations.length === 0 ? (
          <DataState
            kind="empty"
            icon={Boxes}
            title="You are not in an organization yet"
            description="Create one below to start collecting error reports and logs."
          />
        ) : (
          <ul>
            {organizations.map((organization) => (
              <li className="border-b border-border last:border-b-0" key={organization.id}>
                <Link
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-muted"
                  params={{ orgSlug: organization.slug }}
                  to="/orgs/$orgSlug/projects"
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-[13px] font-bold">
                      {organization.name}
                    </strong>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {organization.slug}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <StatusBadge>{organization.role.toLowerCase()}</StatusBadge>
                    <span>Created {dateFormatter.format(new Date(organization.createdAt))}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-4">
        <form
          className="flex flex-wrap items-end gap-3 p-5"
          onSubmit={(event) => void submit(event)}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="organization-name">New organization</Label>
            <Input
              id="organization-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Payments"
              type="text"
              value={name}
            />
          </div>
          <Button className="mb-px" disabled={creating} type="submit">
            {creating ? <Spinner /> : <Plus />}
            Create
          </Button>
        </form>

        {error != null && (
          <p
            className="border-t border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
            role="alert"
          >
            {error}
          </p>
        )}
      </Panel>
    </main>
  );
}
