import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { MembershipRole } from "../src/generated/prisma/client";
import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_SLUG,
} from "../src/organizations/default-organization";
import { signIn } from "./viewer-session";

/**
 * Paths that deliberately need no session.
 *
 * @remarks
 * Health and the docs are infrastructure. The four ingestion paths authenticate
 * with an ingestion token instead, and must never require a viewer, because SDK
 * DSNs derive them. The auth paths are the ones that exist to get a session in
 * the first place.
 */
const UNAUTHENTICATED_PATHS = new Set([
  "/api/v1/health",
  "/api/v1/error-reports",
  "/api/v1/log-records",
  "/api/v1/projects/{projectId}/error-reports",
  "/api/v1/projects/{projectId}/log-records",
  "/api/v1/auth/session",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
]);

function uniqueName(label: string): string {
  return `${label} ${randomUUID().slice(0, 8)}`;
}

describe("Organizations", () => {
  let app: INestApplication;
  let database: PrismaService;
  let ownerCookie: string;
  const createdOrganizationIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdUserIds: string[] = [];

  async function signInAs(role: MembershipRole, organizationId?: string): Promise<string> {
    const signedIn = await signIn(database, { organizationId, role });
    createdUserIds.push(signedIn.userId);
    return signedIn.cookie;
  }

  async function createOrganization(cookie = ownerCookie): Promise<{ id: string; slug: string }> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("cookie", cookie)
      .send({ name: uniqueName("Acme Payments") })
      .expect(201);
    createdOrganizationIds.push(response.body.id);
    return response.body;
  }

  async function createProject(orgSlug: string, cookie: string): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgSlug}/projects`)
      .set("cookie", cookie)
      .send({ name: uniqueName("Checkout API") })
      .expect(201);
    createdProjectIds.push(response.body.id);
    return response.body;
  }

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);

    ownerCookie = await signInAs(MembershipRole.OWNER);
  });

  afterEach(async () => {
    // Restrict on Project -> Organization makes this order load-bearing.
    // Memberships cascade from the organizations that own them.
    const where = { projectId: { in: createdProjectIds } };
    await database.errorReport.deleteMany({ where });
    await database.logRecord.deleteMany({ where });
    await database.projectToken.deleteMany({ where });
    await database.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await database.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    createdProjectIds.length = 0;
    createdOrganizationIds.length = 0;
  });

  afterAll(async () => {
    await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it("keeps the default organization in step with the constants", async () => {
    const organization = await database.organization.findUnique({
      where: { id: DEFAULT_ORGANIZATION_ID },
      select: { slug: true },
    });

    expect(organization?.slug).toBe(DEFAULT_ORGANIZATION_SLUG);
  });

  it("makes the creator of an organization its owner", async () => {
    const created = await createOrganization();

    const listed = await request(app.getHttpServer())
      .get("/api/v1/orgs")
      .set("cookie", ownerCookie)
      .expect(200);

    expect(listed.body.organizations).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, role: "OWNER" })]),
    );
  });

  it("lists only the organizations the caller belongs to", async () => {
    const mine = await createOrganization();
    const stranger = await signInAs(MembershipRole.OWNER);

    const listed = await request(app.getHttpServer())
      .get("/api/v1/orgs")
      .set("cookie", stranger)
      .expect(200);

    expect(listed.body.organizations.some((org: { id: string }) => org.id === mine.id)).toBe(false);
  });

  describe("tenant isolation", () => {
    it("reports an organization the caller is not in as not found, not forbidden", async () => {
      // A 403 here would confirm the organization exists, which is enough to
      // enumerate every tenant on the instance.
      const mine = await createOrganization();
      const stranger = await signInAs(MembershipRole.OWNER);

      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${mine.slug}`)
        .set("cookie", stranger)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${mine.slug}/projects`)
        .set("cookie", stranger)
        .expect(404);
    });

    it("does not reach a project through an organization that does not own it", async () => {
      const mine = await createOrganization();
      const project = await createProject(mine.slug, ownerCookie);

      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${DEFAULT_ORGANIZATION_SLUG}/projects/${project.id}/tokens`)
        .set("cookie", ownerCookie)
        .expect(404);
    });

    it("lets two organizations each own a project with the same slug", async () => {
      const first = await createOrganization();
      const second = await createOrganization();
      const name = uniqueName("Checkout API");

      for (const organization of [first, second]) {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/orgs/${organization.slug}/projects`)
          .set("cookie", ownerCookie)
          .send({ name })
          .expect(201);
        createdProjectIds.push(response.body.id);
      }
    });
  });

  describe("roles", () => {
    it("lets a member read but not create", async () => {
      const organization = await createOrganization();
      const member = await signInAs(MembershipRole.MEMBER, organization.id);
      const project = await createProject(organization.slug, ownerCookie);

      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${organization.slug}/projects`)
        .set("cookie", member)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${organization.slug}/projects/${project.id}/tokens`)
        .set("cookie", member)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${organization.slug}/projects`)
        .set("cookie", member)
        .send({ name: uniqueName("Billing Worker") })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${organization.slug}/projects/${project.id}/tokens`)
        .set("cookie", member)
        .send({ name: "production" })
        .expect(403);
    });

    it("lets an admin mint credentials", async () => {
      const organization = await createOrganization();
      const admin = await signInAs(MembershipRole.ADMIN, organization.id);

      const project = await createProject(organization.slug, admin);
      await request(app.getHttpServer())
        .post(`/api/v1/orgs/${organization.slug}/projects/${project.id}/tokens`)
        .set("cookie", admin)
        .send({ name: "production" })
        .expect(201);
    });

    it("refuses to let an admin grant ownership", async () => {
      const organization = await createOrganization();
      const admin = await signInAs(MembershipRole.ADMIN, organization.id);
      const member = await signInAs(MembershipRole.MEMBER, organization.id);

      const members = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${organization.slug}/members`)
        .set("cookie", admin)
        .expect(200);
      const target = members.body.members.find(
        (candidate: { role: string }) => candidate.role === "MEMBER",
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${organization.slug}/members/${target.userId}`)
        .set("cookie", admin)
        .send({ role: "OWNER" })
        .expect(403);

      // But may promote to admin, which is the limit of what an admin does.
      await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${organization.slug}/members/${target.userId}`)
        .set("cookie", admin)
        .send({ role: "ADMIN" })
        .expect(200);

      expect(member).toBeDefined();
    });

    it("refuses to remove or demote the last owner", async () => {
      const organization = await createOrganization();

      const members = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${organization.slug}/members`)
        .set("cookie", ownerCookie)
        .expect(200);
      const owner = members.body.members.find(
        (candidate: { role: string }) => candidate.role === "OWNER",
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${organization.slug}/members/${owner.userId}`)
        .set("cookie", ownerCookie)
        .send({ role: "ADMIN" })
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${organization.slug}/members/${owner.userId}`)
        .set("cookie", ownerCookie)
        .expect(409);
    });

    it("stops resolving an organization the moment a member is removed", async () => {
      // Membership is read per request rather than baked into the session, so
      // removal takes effect now instead of at the session's expiry.
      const organization = await createOrganization();
      const member = await signInAs(MembershipRole.MEMBER, organization.id);

      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${organization.slug}/projects`)
        .set("cookie", member)
        .expect(200);

      const members = await request(app.getHttpServer())
        .get(`/api/v1/orgs/${organization.slug}/members`)
        .set("cookie", ownerCookie)
        .expect(200);
      const target = members.body.members.find(
        (candidate: { role: string }) => candidate.role === "MEMBER",
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/orgs/${organization.slug}/members/${target.userId}`)
        .set("cookie", ownerCookie)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/orgs/${organization.slug}/projects`)
        .set("cookie", member)
        .expect(404);
    });
  });

  /**
   * Guards are opt-in, so a controller added without one is unprotected and
   * nothing else would notice. This is the compensating control: a new route
   * that neither declares the session credential nor appears on the
   * deliberately-open list fails the build.
   */
  it("requires a session on every route that is not deliberately open", async () => {
    const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

    const unguarded: string[] = [];
    for (const [path, operations] of Object.entries(response.body.paths)) {
      if (UNAUTHENTICATED_PATHS.has(path)) continue;

      for (const [method, operation] of Object.entries(operations as Record<string, unknown>)) {
        const security = (operation as { security?: { session?: unknown }[] }).security ?? [];
        if (!security.some((scheme) => "session" in scheme)) {
          unguarded.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(unguarded).toEqual([]);
  });
});
