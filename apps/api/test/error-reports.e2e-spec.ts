import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import {
  nodeErrorReportExample,
  pythonErrorReportExample,
} from "../src/error-reporting/error-report.examples";
import { DEFAULT_ORGANIZATION_SLUG } from "../src/organizations/default-organization";
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_SLUG } from "../src/projects/default-project";
import { signIn } from "./viewer-session";

const REPORTS_URL = `/api/v1/orgs/${DEFAULT_ORGANIZATION_SLUG}/projects/${DEFAULT_PROJECT_ID}/error-reports`;

describe("Error report ingestion", () => {
  let app: INestApplication;
  let database: PrismaService;
  // Reading is behind a session now. Ingestion, below, deliberately is not.
  let viewer: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);

    const signedIn = await signIn(database);
    viewer = signedIn.cookie;
    createdUserIds.push(signedIn.userId);
  });

  beforeEach(async () => {
    await database.errorReport.deleteMany({
      where: {
        eventId: {
          in: [nodeErrorReportExample.eventId, pythonErrorReportExample.eventId],
        },
      },
    });
  });

  afterAll(async () => {
    // Sessions and memberships cascade from the accounts that own them.
    await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it("stores a normalized report and makes retries idempotent", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/v1/error-reports")
      .send(nodeErrorReportExample)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post("/api/v1/error-reports")
      .send(nodeErrorReportExample)
      .expect(201);

    expect(first.body).toEqual({
      id: expect.any(String),
      receivedAt: expect.any(String),
    });
    expect(retry.body).toEqual(first.body);

    const stored = await database.errorReport.findMany({
      where: {
        eventId: nodeErrorReportExample.eventId,
      },
    });

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      serviceName: "checkout-api",
      runtimeName: "node",
      reporterName: "dolshoe-node",
      exception: nodeErrorReportExample.exception,
    });
  });

  it("lists a project's reports newest-first for a member", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/error-reports")
      .send(pythonErrorReportExample)
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/v1/error-reports")
      .send(nodeErrorReportExample)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(REPORTS_URL)
      .set("cookie", viewer)
      .expect(200);

    const nodeSummary = response.body.reports.find(
      (report: { eventId: string }) => report.eventId === nodeErrorReportExample.eventId,
    );
    const pythonSummary = response.body.reports.find(
      (report: { eventId: string }) => report.eventId === pythonErrorReportExample.eventId,
    );

    expect(response.body.reports.indexOf(nodeSummary)).toBeLessThan(
      response.body.reports.indexOf(pythonSummary),
    );

    expect(nodeSummary).toMatchObject({
      id: expect.any(String),
      eventId: nodeErrorReportExample.eventId,
      occurredAt: nodeErrorReportExample.occurredAt,
      receivedAt: expect.any(String),
      service: {
        name: "checkout-api",
        environment: "production",
        release: "2026.07.24.1",
      },
      runtime: {
        name: "node",
        version: "24.4.1",
      },
      exception: {
        type: "TypeError",
        message: "Cannot read properties of undefined",
        source: {
          fileName: "file:///srv/app/order.js",
          lineNumber: 42,
          columnNumber: 18,
          functionName: "submitOrder",
        },
      },
    });

    expect(pythonSummary).toMatchObject({
      eventId: pythonErrorReportExample.eventId,
      service: {
        name: "billing-worker",
        environment: "production",
      },
      runtime: {
        name: "cpython",
        version: "3.14.0",
      },
      exception: {
        type: "ExceptionGroup",
        message: "settlement failures (2 sub-exceptions)",
      },
    });
    expect(pythonSummary.exception.source).toBeUndefined();
    expect(nodeSummary.project).toEqual({
      id: DEFAULT_PROJECT_ID,
      slug: DEFAULT_PROJECT_SLUG,
      name: expect.any(String),
    });
  });

  it("scopes the listing to the project in its path and rejects a malformed id", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/error-reports")
      .send(nodeErrorReportExample)
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get(REPORTS_URL)
      .set("cookie", viewer)
      .expect(200);

    expect(listed.body.reports.length).toBeGreaterThan(0);
    expect(
      listed.body.reports.every(
        (report: { project: { id: string } }) => report.project.id === DEFAULT_PROJECT_ID,
      ),
    ).toBe(true);

    // A project the organization does not own reads as empty rather than as
    // somebody else's reports.
    const foreign = await request(app.getHttpServer())
      .get(
        `/api/v1/orgs/${DEFAULT_ORGANIZATION_SLUG}/projects/11111111-2222-4333-8444-555555555555/error-reports`,
      )
      .set("cookie", viewer)
      .expect(200);
    expect(foreign.body.reports).toEqual([]);

    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${DEFAULT_ORGANIZATION_SLUG}/projects/nope/error-reports`)
      .set("cookie", viewer)
      .expect(400);
  });

  it("refuses to list anything to a caller with no session", async () => {
    await request(app.getHttpServer()).get(REPORTS_URL).expect(401);
  });

  it("rejects a report outside the documented contract", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/error-reports")
      .send({
        ...pythonErrorReportExample,
        runtime: {
          name: "",
        },
      })
      .expect(400);

    expect(response.body).toMatchObject({
      message: "Request body does not match the error report contract.",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "runtime.name",
        }),
      ]),
    });
  });

  it("serves the generated OpenAPI document with the Zod contract", async () => {
    const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

    expect(response.body.paths["/api/v1/error-reports"].post).toEqual(expect.any(Object));
    // Ingestion keeps its path; reading moved under the owning organization.
    expect(response.body.paths["/api/v1/error-reports"].get).toBeUndefined();
    expect(
      response.body.paths["/api/v1/orgs/{orgSlug}/projects/{projectId}/error-reports"].get,
    ).toEqual(expect.any(Object));
    expect(response.body.components.schemas).toEqual(
      expect.objectContaining({
        ErrorReportRequestV1: expect.any(Object),
        NormalizedExceptionV1: expect.any(Object),
        ErrorReportReceiptV1: expect.any(Object),
        ErrorReportListResponseV1: expect.any(Object),
        ErrorReportSummaryV1: expect.any(Object),
        ErrorReportExceptionSummaryV1: expect.any(Object),
      }),
    );
    expect(
      response.body.components.schemas.ErrorReportRequestV1.properties.runtime.properties.name
        .description,
    ).toContain("Runtime family");
  });
});
