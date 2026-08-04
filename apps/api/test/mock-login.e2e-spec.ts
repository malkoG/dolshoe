import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { SESSION_COOKIE_NAME } from "../src/auth/session-cookie";
import { appConfig } from "../src/config/app-config";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { MembershipRole } from "../src/generated/prisma/client";
import { cookieValue } from "./fake-github";
import { signIn } from "./viewer-session";

function uniqueLogin(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/**
 * The flag is normally decided at startup from the environment. Flipping the
 * resolved value is how `ingest-auth.guard.spec.ts` already exercises its own
 * production branch, and it is what lets one suite cover both an instance that
 * opted in and one that did not.
 */
function setMockLogin(enabled: boolean): void {
  Object.defineProperty(appConfig, "mockLogin", { configurable: true, value: enabled });
}

describe("Mock sign-in", () => {
  let app: INestApplication;
  let database: PrismaService;
  const createdOrganizationIds: string[] = [];
  const originalMockLogin = appConfig.mockLogin;

  function mockSignIn(body: { login: string; invitation?: string }) {
    return request(app.getHttpServer()).post("/api/v1/auth/mock/session").send(body);
  }

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);
  });

  beforeEach(async () => {
    setMockLogin(true);

    // This suite owns the unclaimed-instance state, the same way `auth.e2e-spec`
    // does: whether the first mock sign-in claims the instance is only
    // observable with zero accounts, and the test database persists between
    // runs. Safe because the e2e suite runs with --runInBand.
    await database.session.deleteMany({});
    await database.user.deleteMany({});
  });

  afterEach(async () => {
    setMockLogin(originalMockLogin);
    await database.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    createdOrganizationIds.length = 0;
  });

  afterAll(async () => {
    await database.session.deleteMany({});
    await database.user.deleteMany({});
    await app.close();
  });

  describe("on an instance that did not opt in", () => {
    /**
     * 404 rather than 403, so that an instance without the flag is
     * indistinguishable from one built without the route. There is nothing to be
     * learned by asking.
     */
    it("has no such route", async () => {
      setMockLogin(false);

      await mockSignIn({ login: "octocat" }).expect(404);
      expect(await database.user.count()).toBe(0);
    });

    it("does not offer it in the session response", async () => {
      setMockLogin(false);

      const response = await request(app.getHttpServer()).get("/api/v1/auth/session").expect(200);

      expect(response.body.mockLoginAvailable).toBe(false);
    });
  });

  describe("on an instance that opted in", () => {
    it("announces itself in the session response", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/auth/session").expect(200);

      expect(response.body.mockLoginAvailable).toBe(true);
    });

    it("claims an unclaimed instance, exactly as a GitHub sign-in would", async () => {
      const login = uniqueLogin("claimer");

      const response = await mockSignIn({ login }).expect(200);

      expect(response.body.viewer.githubLogin).toBe(login);
      expect(response.body.organizationSlug).toBeNull();

      const membership = await database.membership.findFirst({
        where: { user: { githubLogin: login } },
        select: { role: true },
      });
      expect(membership?.role).toBe(MembershipRole.OWNER);
    });

    it("hands back a session cookie the rest of the API accepts", async () => {
      const login = uniqueLogin("claimer");

      const signedIn = await mockSignIn({ login }).expect(200);
      const session = cookieValue(signedIn.get("Set-Cookie") ?? [], SESSION_COOKIE_NAME);

      const described = await request(app.getHttpServer())
        .get("/api/v1/auth/session")
        .set("cookie", `${SESSION_COOKIE_NAME}=${session ?? ""}`)
        .expect(200);

      expect(described.body.viewer.githubLogin).toBe(login);
    });

    it("reaches the same account when the same login signs in twice", async () => {
      const login = uniqueLogin("returning");

      const first = await mockSignIn({ login }).expect(200);
      const second = await mockSignIn({ login }).expect(200);

      expect(second.body.viewer.id).toBe(first.body.viewer.id);
      expect(await database.user.count()).toBe(1);
    });

    /**
     * The point of fabricating only the identity: everything that decides who
     * belongs here still runs, so a development instance turns down what a
     * deployed one would.
     */
    it("still refuses a stranger once the instance is claimed", async () => {
      await mockSignIn({ login: uniqueLogin("claimer") }).expect(200);

      const refused = await mockSignIn({ login: uniqueLogin("stranger") }).expect(403);

      expect(refused.body.error).toBe("no_account");
      expect(await database.user.count()).toBe(1);
    });

    it("still refuses a login that is not on the allowlist", async () => {
      Object.defineProperty(appConfig, "githubAllowedLogins", {
        configurable: true,
        value: ["someone-else"],
      });

      try {
        const refused = await mockSignIn({ login: uniqueLogin("outsider") }).expect(403);

        expect(refused.body.error).toBe("not_allowed");
      } finally {
        Object.defineProperty(appConfig, "githubAllowedLogins", {
          configurable: true,
          value: [],
        });
      }
    });

    it("refuses a login the contract does not accept", async () => {
      await mockSignIn({ login: "octocat@example.com" }).expect(400);
      expect(await database.user.count()).toBe(0);
    });

    it("redeems an invitation and lands the browser in that organization", async () => {
      const owner = await signIn(database, { role: MembershipRole.OWNER });

      const organization = await request(app.getHttpServer())
        .post("/api/v1/orgs")
        .set("cookie", owner.cookie)
        .send({ name: `Mock ${randomUUID().slice(0, 8)}` })
        .expect(201);
      createdOrganizationIds.push(organization.body.id);

      const invitee = uniqueLogin("invitee");
      const invitation = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${organization.body.slug}/invitations`)
        .set("cookie", owner.cookie)
        .send({ githubLogin: invitee, role: MembershipRole.MEMBER })
        .expect(201);

      const joined = await mockSignIn({
        login: invitee,
        invitation: invitation.body.invitationUrl.replace("/invitations/", ""),
      }).expect(200);

      expect(joined.body.organizationSlug).toBe(organization.body.slug);

      const membership = await database.membership.findFirst({
        where: { organizationId: organization.body.id, user: { githubLogin: invitee } },
        select: { role: true },
      });
      expect(membership?.role).toBe(MembershipRole.MEMBER);
    });

    it("refuses an invitation issued for somebody else", async () => {
      const owner = await signIn(database, { role: MembershipRole.OWNER });

      const organization = await request(app.getHttpServer())
        .post("/api/v1/orgs")
        .set("cookie", owner.cookie)
        .send({ name: `Mock ${randomUUID().slice(0, 8)}` })
        .expect(201);
      createdOrganizationIds.push(organization.body.id);

      const invitation = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${organization.body.slug}/invitations`)
        .set("cookie", owner.cookie)
        .send({ githubLogin: uniqueLogin("intended"), role: MembershipRole.MEMBER })
        .expect(201);

      const refused = await mockSignIn({
        login: uniqueLogin("interloper"),
        invitation: invitation.body.invitationUrl.replace("/invitations/", ""),
      }).expect(403);

      expect(refused.body.error).toBe("invitation_mismatch");
    });

    /**
     * The same second CSRF lock every other state-changing route carries. A
     * missing `Origin` stays allowed — that is what keeps `curl` able to start a
     * session, which is half of why this endpoint is worth having.
     */
    it("refuses a request another origin started", async () => {
      await mockSignIn({ login: uniqueLogin("victim") })
        .set("origin", "https://evil.example")
        .expect(403);

      expect(await database.user.count()).toBe(0);
    });
  });
});
