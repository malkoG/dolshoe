import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { nodeErrorReportExample } from "../src/error-reporting/error-report.examples";
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_SLUG } from "../src/projects/default-project";
import { hashProjectToken } from "../src/projects/project-token";

interface IssuedToken {
  id: string;
  prefix: string;
  token: string;
}

function logBatch(level: string, message: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    records: [
      {
        eventId: randomUUID(),
        occurredAt: "2026-08-04T09:00:00.000Z",
        level,
        message,
        category: ["checkout"],
        service: { name: "checkout-api" },
        runtime: { name: "node" },
        reporter: { name: "dolshoe-node" },
      },
    ],
  };
}

describe("Projects", () => {
  let app: INestApplication;
  let database: PrismaService;
  const createdProjectIds: string[] = [];

  async function createProject(name: string): Promise<{ id: string; slug: string }> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/projects")
      .send({ name })
      .expect(201);
    createdProjectIds.push(response.body.id);
    return response.body;
  }

  async function issueToken(projectId: string, name = "production"): Promise<IssuedToken> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/tokens`)
      .send({ name })
      .expect(201);
    return response.body;
  }

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);
  });

  afterEach(async () => {
    // Restrict on the event relations means this order is load-bearing: a
    // reversed teardown fails loudly rather than leaving orphans.
    if (createdProjectIds.length === 0) return;
    const where = { projectId: { in: createdProjectIds } };
    await database.errorReport.deleteMany({ where });
    await database.logRecord.deleteMany({ where });
    await database.projectToken.deleteMany({ where });
    await database.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    createdProjectIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps the default project in step with the constant the guard resolves to", async () => {
    const defaultProject = await database.project.findUnique({
      where: { id: DEFAULT_PROJECT_ID },
    });

    expect(defaultProject).not.toBeNull();
    expect(defaultProject?.slug).toBe(DEFAULT_PROJECT_SLUG);
  });

  it("creates a project with a slug derived from its name", async () => {
    const project = await createProject("Checkout API");

    expect(project).toMatchObject({ slug: "checkout-api", name: "Checkout API" });
  });

  it("refuses a slug another project already uses", async () => {
    await createProject("Checkout API");

    await request(app.getHttpServer())
      .post("/api/v1/projects")
      .send({ name: "Checkout API" })
      .expect(409);
  });

  it("returns an issued token once and stores only its digest", async () => {
    const project = await createProject("Checkout API");
    const issued = await issueToken(project.id);

    const stored = await database.projectToken.findUnique({ where: { id: issued.id } });

    expect(stored?.tokenHash).toBe(hashProjectToken(issued.token));
    expect(JSON.stringify(stored)).not.toContain(issued.token);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/projects/${project.id}/tokens`)
      .expect(200);

    expect(JSON.stringify(listed.body)).not.toContain(issued.token);
    expect(listed.body.tokens).toEqual([
      expect.objectContaining({ id: issued.id, prefix: issued.prefix, revokedAt: null }),
    ]);
  });

  it("revokes a token idempotently", async () => {
    const project = await createProject("Checkout API");
    const issued = await issueToken(project.id);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/tokens/${issued.id}/revoke`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/tokens/${issued.id}/revoke`)
      .expect(200);

    expect(first.body.revokedAt).toEqual(expect.any(String));
    expect(second.body.revokedAt).toBe(first.body.revokedAt);
  });

  it("refuses to revoke a token through a project that does not own it", async () => {
    const owner = await createProject("Checkout API");
    const other = await createProject("Billing Worker");
    const issued = await issueToken(owner.id);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${other.id}/tokens/${issued.id}/revoke`)
      .expect(404);
  });

  it("stores an ingest authenticated by a project token against that project", async () => {
    const project = await createProject("Checkout API");
    const issued = await issueToken(project.id);
    const eventId = randomUUID();

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/error-reports`)
      .set("authorization", `Bearer ${issued.token}`)
      .send({ ...nodeErrorReportExample, eventId })
      .expect(201);

    const stored = await database.errorReport.findFirst({ where: { eventId } });

    expect(stored?.projectId).toBe(project.id);
  });

  it("records that a token has been used", async () => {
    const project = await createProject("Checkout API");
    const issued = await issueToken(project.id);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/error-reports`)
      .set("authorization", `Bearer ${issued.token}`)
      .send({ ...nodeErrorReportExample, eventId: randomUUID() })
      .expect(201);

    // lastUsedAt is refreshed outside the request, so give it a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const stored = await database.projectToken.findUnique({ where: { id: issued.id } });

    expect(stored?.lastUsedAt).not.toBeNull();
  });

  it("refuses a token presented for someone else's project", async () => {
    const owner = await createProject("Checkout API");
    const other = await createProject("Billing Worker");
    const issued = await issueToken(owner.id);
    const eventId = randomUUID();

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${other.id}/error-reports`)
      .set("authorization", `Bearer ${issued.token}`)
      .send({ ...nodeErrorReportExample, eventId })
      .expect(403);

    await expect(database.errorReport.findFirst({ where: { eventId } })).resolves.toBeNull();
  });

  it("refuses a revoked token", async () => {
    const project = await createProject("Checkout API");
    const issued = await issueToken(project.id);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/tokens/${issued.id}/revoke`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/error-reports`)
      .set("authorization", `Bearer ${issued.token}`)
      .send({ ...nodeErrorReportExample, eventId: randomUUID() })
      .expect(401);
  });

  it("refuses a well-formed token that was never issued", async () => {
    const project = await createProject("Checkout API");
    const impostor = `dsh_0123456789ab_${"a".repeat(43)}`;

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/error-reports`)
      .set("authorization", `Bearer ${impostor}`)
      .send({ ...nodeErrorReportExample, eventId: randomUUID() })
      .expect(401);
  });

  it("stores a log batch against the project its token belongs to", async () => {
    const project = await createProject("Checkout API");
    const issued = await issueToken(project.id);
    const eventId = randomUUID();

    await request(app.getHttpServer())
      .post(`/api/v1/projects/${project.id}/log-records`)
      .set("authorization", `Bearer ${issued.token}`)
      .send({
        schemaVersion: 1,
        records: [
          {
            eventId,
            occurredAt: "2026-08-04T09:00:00.000Z",
            level: "info",
            message: "Payment authorized",
            category: ["checkout", "payment"],
            service: { name: "checkout-api" },
            runtime: { name: "node" },
            reporter: { name: "dolshoe-node" },
          },
        ],
      })
      .expect(201);

    const stored = await database.logRecord.findFirst({ where: { eventId } });

    expect(stored?.projectId).toBe(project.id);
    expect(stored?.message).toBe("Payment authorized");
  });

  it("reads back only the requesting project's logs, and filters by severity", async () => {
    const owner = await createProject("Checkout API");
    const other = await createProject("Billing Worker");
    const ownerToken = await issueToken(owner.id);
    const otherToken = await issueToken(other.id);

    for (const [token, projectId, payload] of [
      [ownerToken.token, owner.id, logBatch("info", "Payment authorized")],
      [ownerToken.token, owner.id, logBatch("error", "Payment gateway timed out")],
      [otherToken.token, other.id, logBatch("info", "Invoice generated")],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/log-records`)
        .set("authorization", `Bearer ${token}`)
        .send(payload)
        .expect(201);
    }

    const mine = await request(app.getHttpServer())
      .get(`/api/v1/log-records?projectId=${owner.id}`)
      .expect(200);
    const errorsOnly = await request(app.getHttpServer())
      .get(`/api/v1/log-records?projectId=${owner.id}&level=error`)
      .expect(200);

    expect(
      mine.body.records.map((record: { message: string }) => record.message).toSorted(),
    ).toEqual(["Payment authorized", "Payment gateway timed out"]);
    expect(errorsOnly.body.records).toHaveLength(1);
    expect(errorsOnly.body.records[0]).toMatchObject({
      level: "error",
      message: "Payment gateway timed out",
      category: ["checkout"],
      service: { name: "checkout-api" },
    });

    await request(app.getHttpServer()).get("/api/v1/log-records").expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/log-records?projectId=${owner.id}&level=critical`)
      .expect(400);
  });

  it("lets the same eventId be reported independently by two projects", async () => {
    const first = await createProject("Checkout API");
    const second = await createProject("Billing Worker");
    const firstToken = await issueToken(first.id);
    const secondToken = await issueToken(second.id);
    const eventId = randomUUID();
    const report = { ...nodeErrorReportExample, eventId };

    const firstReceipt = await request(app.getHttpServer())
      .post(`/api/v1/projects/${first.id}/error-reports`)
      .set("authorization", `Bearer ${firstToken.token}`)
      .send(report)
      .expect(201);
    const secondReceipt = await request(app.getHttpServer())
      .post(`/api/v1/projects/${second.id}/error-reports`)
      .set("authorization", `Bearer ${secondToken.token}`)
      .send(report)
      .expect(201);

    expect(secondReceipt.body.id).not.toBe(firstReceipt.body.id);
    await expect(database.errorReport.count({ where: { eventId } })).resolves.toBe(2);
  });

  it("documents the project routes in the OpenAPI document", async () => {
    const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

    expect(response.body.paths["/api/v1/projects"].post).toEqual(expect.any(Object));
    expect(response.body.paths["/api/v1/projects/{projectId}/error-reports"].post).toEqual(
      expect.any(Object),
    );
    expect(response.body.components.schemas).toEqual(
      expect.objectContaining({
        ProjectV1: expect.any(Object),
        IssuedProjectTokenV1: expect.any(Object),
        ProjectTokenListResponseV1: expect.any(Object),
      }),
    );
  });
});
