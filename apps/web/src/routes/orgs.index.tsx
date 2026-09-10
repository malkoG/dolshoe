import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { ApiError, describeError } from "../lib/api-request";
import { dateFormatter } from "../lib/format";
import { createOrganization } from "../lib/organizations";
import { useSignOut } from "../lib/use-sign-out";
import { OrganizationsScreen } from "../screens/organizations/organizations-screen";
import { ORGANIZATION_SLUG_CONFLICT } from "../screens/organizations/organizations-screen.states";

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

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
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
          ? ORGANIZATION_SLUG_CONFLICT
          : describeError(cause, "Something went wrong while creating the organization."),
      );
      setCreating(false);
    }
  }

  return (
    <OrganizationsScreen
      back={
        first == null
          ? undefined
          : { href: `/orgs/${first.slug}/projects`, label: `Back to ${first.name}` }
      }
      creating={creating}
      error={error}
      name={name}
      onNameChange={setName}
      onSignOut={() => void signOut()}
      onSubmit={(event) => void submit(event)}
      organizations={organizations.map((organization) => ({
        createdLabel: `Created ${dateFormatter.format(new Date(organization.createdAt))}`,
        href: `/orgs/${organization.slug}/projects`,
        id: organization.id,
        name: organization.name,
        roleLabel: organization.role.toLowerCase(),
        slug: organization.slug,
      }))}
    />
  );
}
