import { Outlet, createFileRoute, notFound, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/orgs/$orgSlug")({
  /**
   * The gate every organization-scoped page sits behind.
   *
   * @remarks
   * The session already lists what the viewer belongs to, so this needs no
   * request of its own. An organization that is not in that list is reported as
   * not found rather than as forbidden — the same posture the API takes, so a
   * link to somebody else's organization cannot be used to discover that it
   * exists.
   */
  beforeLoad: ({ context, location, params }) => {
    if (context.session.viewer == null) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }

    const organization = context.session.organizations.find(
      (candidate) => candidate.slug === params.orgSlug,
    );
    if (organization == null) throw notFound();

    return { organization };
  },
  component: OrganizationLayout,
});

function OrganizationLayout() {
  return <Outlet />;
}
