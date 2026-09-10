import {
  ORGANIZATION_SLUG_CONFLICT,
  type OrganizationsScreenOrganization,
  type OrganizationsScreenProps,
} from "./organizations-screen";

/**
 * Named states for the organizations list.
 *
 * @remarks
 * The view receives values and paints them. These factories are the other
 * composition root — the one a construction test and a silhouette use instead
 * of reading the session. The list itself does not load: it comes from the
 * session the root route already resolved. There is no idle or in-progress
 * here; inventing a spinner the screen cannot show would only photograph a lie.
 *
 * `error` is the create-form 409, not a failed list load — Figma frame 85:2.
 */
function noopSubmit(event: { preventDefault(): void }): void {
  event.preventDefault();
}

function commands(): Pick<
  OrganizationsScreenProps,
  "creating" | "name" | "onNameChange" | "onSignOut" | "onSubmit"
> {
  return {
    creating: false,
    name: "",
    onNameChange: () => undefined,
    onSignOut: () => undefined,
    onSubmit: noopSubmit,
  };
}

const populatedOrganizations: readonly OrganizationsScreenOrganization[] = [
  {
    createdLabel: "Created Aug 14, 2026",
    href: "/orgs/acme-payments/projects",
    id: "org-acme",
    name: "Acme Payments",
    roleLabel: "owner",
    slug: "acme-payments",
  },
  {
    createdLabel: "Created Jun 3, 2026",
    href: "/orgs/northwind/projects",
    id: "org-northwind",
    name: "Northwind Logistics",
    roleLabel: "admin",
    slug: "northwind",
  },
  {
    createdLabel: "Created Sep 1, 2026",
    href: "/orgs/sandbox/projects",
    id: "org-sandbox",
    name: "Personal sandbox",
    roleLabel: "member",
    slug: "sandbox",
  },
];

function backToAcme(): NonNullable<OrganizationsScreenProps["back"]> {
  return { href: "/orgs/acme-payments/projects", label: "Back to Acme Payments" };
}

function empty(): OrganizationsScreenProps {
  return {
    ...commands(),
    organizations: [],
  };
}

function populated(): OrganizationsScreenProps {
  return {
    ...commands(),
    back: backToAcme(),
    organizations: populatedOrganizations,
  };
}

function error(): OrganizationsScreenProps {
  return {
    ...populated(),
    error: ORGANIZATION_SLUG_CONFLICT,
  };
}

export const organizationsScreenStates = {
  empty,
  populated,
  error,
} as const;

export const organizationsScreenStateNames = ["empty", "populated", "error"] as const;

export type OrganizationsScreenStateName = (typeof organizationsScreenStateNames)[number];

export function isOrganizationsScreenStateName(
  value: string | null,
): value is OrganizationsScreenStateName {
  return value != null && (organizationsScreenStateNames as readonly string[]).includes(value);
}
