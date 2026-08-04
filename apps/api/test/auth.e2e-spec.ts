import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GitHubIdentity } from "../src/auth/github-identity";
import { GitHubOAuthClient } from "../src/auth/github-oauth.client";
import { OAUTH_STATE_COOKIE_NAME } from "../src/auth/oauth-state";
import {
  AUTHORIZE_ORIGIN,
  FakeGitHub,
  cookieValue,
  identity,
  signInWithGitHub as completeSignIn,
} from "./fake-github";
import { SESSION_COOKIE_NAME } from "../src/auth/session-cookie";
import { generateSessionToken } from "../src/auth/session-token";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { DEFAULT_ORGANIZATION_ID } from "../src/organizations/default-organization";
import { DEFAULT_PROJECT_ID } from "../src/projects/default-project";
import { generateProjectToken } from "../src/projects/project-token";

describe("Authentication", () => {
  let app: INestApplication;
  let database: PrismaService;
  let github: FakeGitHub;
  const createdProjectIds: string[] = [];

  function signInWithGitHub(
    who: GitHubIdentity,
    options: { invitation?: string; redirect?: string } = {},
  ) {
    return completeSignIn(app, github, who, options);
  }

  /**
   * Creates a signed-in session directly rather than through the flow, for the
   * tests that only need a session to exist.
   */
  async function signIn(): Promise<{ cookie: string; userId: string }> {
    const who = identity();
    const user = await database.user.create({
      data: {
        email: who.email,
        name: "Tester",
        githubUserId: who.githubUserId,
        githubLogin: who.githubLogin,
      },
      select: { id: true },
    });

    const token = generateSessionToken();
    await database.session.create({
      data: {
        userId: user.id,
        prefix: token.prefix,
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + 60_000),
      },
      select: { id: true },
    });

    return { cookie: `${SESSION_COOKIE_NAME}=${token.raw}`, userId: user.id };
  }

  /**
   * Builds a project and its ingestion token directly.
   *
   * @remarks
   * Not through the project API, which needs a session: these tests are about
   * an instance with no accounts at all, so creating one to set them up would
   * destroy the state under test.
   */
  async function createIngestionToken(): Promise<{ projectId: string; token: string }> {
    const project = await database.project.create({
      data: {
        organizationId: DEFAULT_ORGANIZATION_ID,
        slug: `credential-separation-${randomUUID().slice(0, 8)}`,
        name: "Credential Separation",
      },
      select: { id: true },
    });
    createdProjectIds.push(project.id);

    const token = generateProjectToken();
    await database.projectToken.create({
      data: {
        projectId: project.id,
        name: "production",
        prefix: token.prefix,
        tokenHash: token.hash,
      },
      select: { id: true },
    });

    return { projectId: project.id, token: token.raw };
  }

  beforeAll(async () => {
    github = new FakeGitHub();

    const moduleReference = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GitHubOAuthClient)
      .useValue(github)
      .compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);
  });

  beforeEach(async () => {
    // This suite owns the unclaimed-instance state: the claim tests are only
    // meaningful with zero accounts, and the test database persists between
    // runs. Safe because the e2e suite runs with --runInBand.
    await database.session.deleteMany({});
    await database.user.deleteMany({});
    github.reset();
  });

  afterEach(async () => {
    // Restrict on the event relations makes this order load-bearing.
    const where = { projectId: { in: createdProjectIds } };
    await database.errorReport.deleteMany({ where });
    await database.logRecord.deleteMany({ where });
    await database.projectToken.deleteMany({ where });
    await database.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    createdProjectIds.length = 0;
  });

  afterAll(async () => {
    await database.session.deleteMany({});
    await database.user.deleteMany({});
    await app.close();
  });

  describe("starting the flow", () => {
    it("sends the browser to GitHub and keeps the state in a cookie", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/github/start")
        .expect(302);

      expect(response.get("Location")).toContain(AUTHORIZE_ORIGIN);

      // Asserted on the raw header, not a parsed convenience object, because
      // these attributes are the protection.
      const cookie = (response.get("Set-Cookie") ?? []).join("; ");
      expect(cookie).toContain(`${OAUTH_STATE_COOKIE_NAME}=`);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
    });

    it("explains itself rather than erroring when no OAuth app is configured", async () => {
      github.configuration = undefined;

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/github/start")
        .expect(302);

      expect(response.get("Location")).toBe("/login?error=not_configured");
    });
  });

  describe("claiming the instance", () => {
    it("lets the first GitHub account in, and signs it in", async () => {
      const who = identity();

      const { location, sessionCookie } = await signInWithGitHub(who);

      expect(location).toBe("/");
      expect(sessionCookie).toContain("dsv_");

      const created = await database.user.findUnique({
        where: { githubUserId: who.githubUserId },
        select: { id: true, githubLogin: true, email: true },
      });
      expect(created).toMatchObject({ githubLogin: who.githubLogin, email: who.email });

      // Owner of the default organization, which is where every project an
      // upgraded instance already had was backfilled.
      const membership = await database.membership.findFirst({
        where: { userId: created?.id },
        select: { organizationId: true, role: true },
      });
      expect(membership).toEqual({ organizationId: DEFAULT_ORGANIZATION_ID, role: "OWNER" });
    });

    it("refuses every other account once it has been claimed", async () => {
      await signInWithGitHub(identity());

      const { location, sessionCookie } = await signInWithGitHub(identity());

      expect(location).toBe("/login?error=no_account");
      expect(sessionCookie).toBeUndefined();
      expect(await database.user.count()).toBe(1);
    });

    it("reports whether the instance has been claimed", async () => {
      const before = await request(app.getHttpServer()).get("/api/v1/auth/session").expect(200);
      expect(before.body).toEqual({
        viewer: null,
        organizations: [],
        instanceClaimed: false,
        githubSignInConfigured: true,
      });

      await signInWithGitHub(identity());

      const after = await request(app.getHttpServer()).get("/api/v1/auth/session").expect(200);
      expect(after.body).toMatchObject({ viewer: null, instanceClaimed: true });
    });
  });

  describe("returning to the callback", () => {
    it("returns to where the sign-in started", async () => {
      const { location } = await signInWithGitHub(identity(), { redirect: "/orgs" });

      expect(location).toBe("/orgs");
    });

    it("refuses to bounce the browser off this site", async () => {
      const { location } = await signInWithGitHub(identity(), {
        redirect: "https://attacker.example/",
      });

      expect(location).toBe("/");
    });

    it("refuses a callback whose state does not match the cookie", async () => {
      const started = await request(app.getHttpServer())
        .get("/api/v1/auth/github/start")
        .expect(302);
      const state = cookieValue(started.get("Set-Cookie") ?? [], OAUTH_STATE_COOKIE_NAME);

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/github/callback?code=code&state=not-the-nonce")
        .set("cookie", `${OAUTH_STATE_COOKIE_NAME}=${state ?? ""}`)
        .expect(302);

      expect(response.get("Location")).toBe("/login?error=state");
      expect(await database.user.count()).toBe(0);
    });

    it("refuses a callback carrying no state cookie at all", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/github/callback?code=code&state=anything")
        .expect(302);

      expect(response.get("Location")).toBe("/login?error=state");
    });

    it("says so plainly when the person declined at GitHub", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/github/callback?error=access_denied")
        .expect(302);

      expect(response.get("Location")).toBe("/login?error=denied");
    });
  });

  describe("an account from before GitHub sign-in", () => {
    it("is adopted by the GitHub account with the same address", async () => {
      const legacy = await database.user.create({
        data: { email: "ops@example.com", name: "Ops" },
        select: { id: true },
      });
      await database.membership.create({
        data: { organizationId: DEFAULT_ORGANIZATION_ID, userId: legacy.id, role: "OWNER" },
        select: { id: true },
      });

      const who = identity({ email: "ops@example.com" });
      const { sessionCookie } = await signInWithGitHub(who);

      expect(sessionCookie).toContain("dsv_");
      // The same row, so the memberships it already held come with it.
      expect(await database.user.count()).toBe(1);
      expect(
        await database.user.findUnique({
          where: { id: legacy.id },
          select: { githubUserId: true },
        }),
      ).toEqual({ githubUserId: who.githubUserId });
    });
  });

  describe("the session", () => {
    it("describes the viewer it belongs to", async () => {
      const { cookie, userId } = await signIn();

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/session")
        .set("cookie", cookie)
        .expect(200);

      expect(response.body.viewer).toMatchObject({ id: userId, name: "Tester" });
      expect(response.body.viewer.githubLogin).toEqual(expect.any(String));
    });

    it("ends on sign-out, leaving the cookie worthless", async () => {
      const { cookie } = await signIn();

      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("cookie", cookie)
        .expect(204);

      const after = await request(app.getHttpServer())
        .get("/api/v1/auth/session")
        .set("cookie", cookie)
        .expect(200);

      expect(after.body.viewer).toBeNull();
    });

    it("reports a signed-out caller rather than failing", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/auth/session").expect(200);

      expect(response.body.viewer).toBeNull();
    });

    it("treats an expired session as no session", async () => {
      const { cookie } = await signIn();
      await database.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/session")
        .set("cookie", cookie)
        .expect(200);

      expect(response.body.viewer).toBeNull();
    });
  });

  /**
   * Ingestion tokens and viewer sessions authorize unrelated things. These pin
   * the separations that keep either from standing in for the other.
   */
  describe("the two credential systems", () => {
    it("does not accept an ingestion token as a session", async () => {
      const { token } = await createIngestionToken();

      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("cookie", `${SESSION_COOKIE_NAME}=${token}`)
        .expect(401);
    });

    it("does not accept a session token as an ingestion credential", async () => {
      const token = generateSessionToken();
      const eventId = randomUUID();

      // Outside production with no INGEST_TOKEN set, ingestion accepts requests
      // carrying no usable credential and attributes them to the default
      // project. A session token is not an ingestion token, so it lands in that
      // branch rather than authenticating as the account behind it — it buys
      // nothing an anonymous request did not already have. Pinned here so the
      // behaviour stays deliberate rather than being rediscovered.
      await request(app.getHttpServer())
        .post("/api/v1/error-reports")
        .set("authorization", `Bearer ${token.raw}`)
        .send({
          schemaVersion: 1,
          eventId,
          occurredAt: "2026-08-04T09:00:00.000Z",
          service: { name: "checkout-api" },
          runtime: { name: "node" },
          reporter: { name: "dolshoe-node" },
          exception: { type: "Error", message: "boom" },
        })
        .expect(201);

      const stored = await database.errorReport.findFirst({
        where: { eventId },
        select: { id: true, projectId: true },
      });
      expect(stored?.projectId).toBe(DEFAULT_PROJECT_ID);

      await database.errorReport.deleteMany({ where: { eventId } });
    });

    it("does not accept a forged session token", async () => {
      const forged = generateSessionToken();

      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("cookie", `${SESSION_COOKIE_NAME}=${forged.raw}`)
        .expect(401);
    });

    it("keeps ingestion working while the instance is unclaimed", async () => {
      // The upgrade path. An instance nobody has claimed yet still accepts
      // everything the SDKs in the field send it: adding viewer auth must not
      // take an existing deployment off the air while its operator works out
      // who is going to claim it.
      expect(await database.user.count()).toBe(0);

      const { projectId, token } = await createIngestionToken();

      const eventId = randomUUID();
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/error-reports`)
        .set("authorization", `Bearer ${token}`)
        .send({
          schemaVersion: 1,
          eventId,
          occurredAt: "2026-08-04T09:00:00.000Z",
          service: { name: "checkout-api" },
          runtime: { name: "node" },
          reporter: { name: "dolshoe-node" },
          exception: { type: "Error", message: "boom" },
        })
        .expect(201);

      const stored = await database.errorReport.findFirst({
        where: { eventId },
        select: { projectId: true },
      });
      expect(stored?.projectId).toBe(projectId);

      await database.errorReport.deleteMany({ where: { eventId } });
    });
  });

  describe("the documented API", () => {
    it("describes the auth routes and the session credential", async () => {
      const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

      expect(Object.keys(response.body.paths)).toEqual(
        expect.arrayContaining([
          "/api/v1/auth/session",
          "/api/v1/auth/github/start",
          "/api/v1/auth/github/callback",
          "/api/v1/auth/logout",
        ]),
      );
      expect(response.body.components.schemas).toHaveProperty("ViewerV1");
      expect(response.body.components.schemas).toHaveProperty("SessionResponseV1");
      expect(response.body.components.securitySchemes).toHaveProperty("session");
    });
  });
});
