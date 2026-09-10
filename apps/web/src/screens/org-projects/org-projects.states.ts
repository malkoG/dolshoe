import type { OrgProjectsOrganization, OrgProjectsProps } from "./org-projects";

/**
 * Named states for the organization projects screen.
 *
 * @remarks
 * The view is a public view: it receives chrome, a list, and a create form
 * and paints them. These factories are the other composition root — the one
 * a construction test and a silhouette use instead of fetching from the API.
 *
 * The four names match the Figma frames on page 13: a populated list, an
 * empty list, the same list at the 1024 compact viewport, and the
 * organization menu open over the populated list.
 */

const ACME: OrgProjectsOrganization = {
  href: "/orgs/acme-payments/projects",
  initial: "A",
  markTone: "brand",
  name: "Acme Payments",
  role: "owner",
  slug: "acme-payments",
};

const ORGANIZATIONS: OrgProjectsOrganization[] = [
  ACME,
  {
    href: "/orgs/northwind-logistics/projects",
    initial: "N",
    markTone: "info",
    name: "Northwind Logistics",
    role: "admin",
    slug: "northwind-logistics",
  },
  {
    href: "/orgs/personal-sandbox/projects",
    initial: "P",
    markTone: "identity",
    name: "Personal sandbox",
    role: "member",
    slug: "personal-sandbox",
  },
  {
    href: "/orgs/blue-harbor-media/projects",
    initial: "B",
    markTone: "violet",
    name: "Blue Harbor Media",
    role: "member",
    slug: "blue-harbor-media",
  },
  {
    href: "/orgs/kestrel-robotics/projects",
    initial: "K",
    markTone: "success",
    name: "Kestrel Robotics",
    role: "admin",
    slug: "kestrel-robotics",
  },
];

const HREFS = {
  members: "/orgs/acme-payments/members",
  organizations: "/orgs",
  projects: "/orgs/acme-payments/projects",
  settings: "/orgs/acme-payments/settings",
} as const;

const VIEWER = {
  handle: "@kodingwarrior",
  initials: "KW",
  name: "Koding Warrior",
} as const;

const idleCreate = {
  name: "",
  onNameChange: () => undefined,
  onSubmit: (event: React.FormEvent) => {
    event.preventDefault();
  },
  submitting: false,
} as const;

const POPULATED_PROJECTS = [
  project("checkout-api", "2026-09-02T12:00:00.000Z"),
  project("payments", "2026-08-21T12:00:00.000Z"),
  project("storefront-web", "2026-08-14T12:00:00.000Z"),
  project("worker", "2026-08-14T12:00:00.000Z"),
] as const;

const COMPACT_PROJECTS = [
  ...POPULATED_PROJECTS,
  project("notifications-service", "2026-08-03T12:00:00.000Z"),
  project("data-pipeline-nightly-rollup", "2026-07-29T12:00:00.000Z"),
  project("mobile-ios", "2026-07-12T12:00:00.000Z"),
] as const;

function project(slug: string, createdAt: string) {
  return {
    createdAt,
    href: `/orgs/acme-payments/projects/${slug}/reports`,
    id: slug,
    name: slug,
    slug,
  };
}

function chrome(): Pick<
  OrgProjectsProps,
  "create" | "hrefs" | "organization" | "organizations" | "viewer"
> {
  return {
    create: idleCreate,
    hrefs: HREFS,
    organization: ACME,
    organizations: ORGANIZATIONS,
    viewer: VIEWER,
  };
}

function populated(): OrgProjectsProps {
  return {
    ...chrome(),
    frame: "1440",
    list: { projects: [...POPULATED_PROJECTS], status: "ready" },
  };
}

function empty(): OrgProjectsProps {
  return {
    ...chrome(),
    frame: "1440",
    list: { projects: [], status: "ready" },
  };
}

function compact(): OrgProjectsProps {
  return {
    ...chrome(),
    density: "compact",
    frame: "1024",
    list: { projects: [...COMPACT_PROJECTS], status: "ready" },
  };
}

function orgMenuOpen(): OrgProjectsProps {
  return {
    ...populated(),
    orgMenuOpen: true,
  };
}

export const orgProjectsStates = {
  populated,
  empty,
  compact,
  orgMenuOpen,
} as const;

export const orgProjectsStateNames = ["populated", "empty", "compact", "orgMenuOpen"] as const;

export type OrgProjectsStateName = (typeof orgProjectsStateNames)[number];

export function isOrgProjectsStateName(value: string | null): value is OrgProjectsStateName {
  return value != null && (orgProjectsStateNames as readonly string[]).includes(value);
}
