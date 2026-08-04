import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { SESSION_COOKIE_NAME } from "../src/auth/session-cookie";
import { generateSessionToken } from "../src/auth/session-token";
import { hashPassword } from "../src/auth/password";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { DEFAULT_PROJECT_ID } from "../src/projects/default-project";

const PASSWORD = "correct horse battery staple";

function uniqueEmail(): string {
  return `ops-${randomUUID().slice(0, 8)}@example.com`;
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("Authentication", () => {
  let app: INestApplication;
  let database: PrismaService;

  /**
   * Creates a signed-in session directly rather than through the API.
   *
   * @remarks
   * Registration only succeeds while the instance is unclaimed, so a suite that
   * needs several accounts cannot get them that way. Writing the row here is the
   * same move `projects.e2e-spec.ts` makes when it hashes a token by hand.
   */
  async function signIn(): Promise<{ cookie: string; userId: string }> {
    const user = await database.user.create({
      data: { email: uniqueEmail(), name: "Tester", passwordHash: await hashPassword(PASSWORD) },
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

    return { cookie: sessionCookie(token.raw), userId: user.id };
  }

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);
  });

  beforeEach(async () => {
    // This suite owns the unclaimed-instance state: the registration tests are
    // only meaningful with zero accounts, and the test database persists between
    // runs. Safe because the e2e suite runs with --runInBand.
    await database.session.deleteMany({});
    await database.user.deleteMany({});
  });

  afterAll(async () => {
    await database.session.deleteMany({});
    await database.user.deleteMany({});
    await app.close();
  });

  describe("claiming the instance", () => {
    it("lets the first account register, and signs it in", async () => {
      const email = uniqueEmail();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, name: "Ops", password: PASSWORD })
        .expect(201);

      expect(response.body).toEqual({ id: expect.any(String), email, name: "Ops" });

      const cookies = response.get("Set-Cookie") ?? [];
      expect(cookies.join("; ")).toContain(`${SESSION_COOKIE_NAME}=dsv_`);
    });

    it("refuses every registration after the first", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: uniqueEmail(), name: "Ops", password: PASSWORD })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: uniqueEmail(), name: "Second", password: PASSWORD })
        .expect(409);
    });

    it("reports whether the instance has been claimed", async () => {
      const before = await request(app.getHttpServer()).get("/api/v1/auth/session").expect(200);
      expect(before.body).toEqual({ viewer: null, instanceClaimed: false });

      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: uniqueEmail(), name: "Ops", password: PASSWORD })
        .expect(201);

      const after = await request(app.getHttpServer()).get("/api/v1/auth/session").expect(200);
      expect(after.body).toMatchObject({ viewer: null, instanceClaimed: true });
    });

    it("rejects a password too short to be worth hashing", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: uniqueEmail(), name: "Ops", password: "short" })
        .expect(400);
    });
  });

  describe("signing in", () => {
    it("sets a cookie a browser will keep to itself", async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, name: "Ops", password: PASSWORD })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: PASSWORD })
        .expect(200);

      // Asserted on the raw header, not a parsed convenience object, because
      // these attributes are the protection.
      const cookie = (response.get("Set-Cookie") ?? []).join("; ");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
    });

    it("treats an unknown address and a wrong password the same way", async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, name: "Ops", password: PASSWORD })
        .expect(201);

      const wrongPassword = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email, password: "not the password" })
        .expect(401);

      const unknownAddress = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(401);

      expect(unknownAddress.body.message).toBe(wrongPassword.body.message);
    });

    it("signs in with an address that differs only in case", async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email, name: "Ops", password: PASSWORD })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(200);
    });

    it("refuses a sign-in a different site initiated", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("origin", "https://attacker.example")
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(403);
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
      const project = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .send({ name: `Credential Separation ${randomUUID().slice(0, 8)}` })
        .expect(201);

      const issued = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.body.id}/tokens`)
        .send({ name: "production" })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("cookie", sessionCookie(issued.body.token))
        .expect(401);

      await database.projectToken.deleteMany({ where: { projectId: project.body.id } });
      await database.project.deleteMany({ where: { id: project.body.id } });
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
        .set("cookie", sessionCookie(forged.raw))
        .expect(401);
    });

    it("keeps ingestion working while the instance is unclaimed", async () => {
      // The upgrade path. An instance that nobody has registered on yet still
      // accepts everything the SDKs in the field send it: adding viewer auth
      // must not take an existing deployment off the air while its operator
      // works out who is going to claim it.
      expect(await database.user.count()).toBe(0);

      const project = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .send({ name: `Unclaimed Ingest ${randomUUID().slice(0, 8)}` })
        .expect(201);

      const issued = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.body.id}/tokens`)
        .send({ name: "production" })
        .expect(201);

      const eventId = randomUUID();
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.body.id}/error-reports`)
        .set("authorization", `Bearer ${issued.body.token}`)
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
      expect(stored?.projectId).toBe(project.body.id);

      await database.errorReport.deleteMany({ where: { eventId } });
      await database.projectToken.deleteMany({ where: { projectId: project.body.id } });
      await database.project.deleteMany({ where: { id: project.body.id } });
    });
  });

  describe("the documented API", () => {
    it("describes the auth routes and the session credential", async () => {
      const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

      expect(Object.keys(response.body.paths)).toEqual(
        expect.arrayContaining([
          "/api/v1/auth/session",
          "/api/v1/auth/register",
          "/api/v1/auth/login",
          "/api/v1/auth/logout",
        ]),
      );
      expect(response.body.components.schemas).toHaveProperty("ViewerV1");
      expect(response.body.components.schemas).toHaveProperty("SessionResponseV1");
      expect(response.body.components.securitySchemes).toHaveProperty("session");
    });
  });
});
