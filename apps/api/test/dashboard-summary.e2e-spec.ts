import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { nodeErrorReportExample } from "../src/error-reporting/error-report.examples";
import { logRecordBatchExample } from "../src/log-recording/log-record.examples";
import { DEFAULT_ORGANIZATION_SLUG } from "../src/organizations/default-organization";
import { DEFAULT_PROJECT_ID } from "../src/projects/default-project";
import { signIn } from "./viewer-session";

const SUMMARY_URL = `/api/v1/orgs/${DEFAULT_ORGANIZATION_SLUG}/projects/${DEFAULT_PROJECT_ID}/dashboard-summary`;

describe("Project dashboard summary", () => {
  let app: INestApplication;
  let database: PrismaService;
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
      where: { eventId: nodeErrorReportExample.eventId },
    });
    await database.logRecord.deleteMany({
      where: { eventId: logRecordBatchExample.records[0]!.eventId },
    });
  });

  afterAll(async () => {
    await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it("counts a freshly received report and record within the trailing window", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/error-reports")
      .send(nodeErrorReportExample)
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/v1/log-records")
      .send(logRecordBatchExample)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(SUMMARY_URL)
      .set("cookie", viewer)
      .expect(200);

    expect(response.body.errorReports.total).toBeGreaterThanOrEqual(1);
    expect(response.body.errorReports.byEnvironment).toMatchObject({
      [nodeErrorReportExample.service.environment]: expect.any(Number),
    });
    expect(response.body.errorReports.byRuntime).toMatchObject({
      [nodeErrorReportExample.runtime.name]: expect.any(Number),
    });
    expect(response.body.errorReports.lastReceivedAt).toEqual(expect.any(String));
    expect(response.body.logRecords.total).toBeGreaterThanOrEqual(1);
    expect(response.body.traces.total).toBe(0);
    expect(response.body.volumeSeries).toHaveLength(7);
    // The freshly received report and record land in the trailing bucket.
    const lastBucket = response.body.volumeSeries[6];
    expect(lastBucket.errorReports).toBeGreaterThanOrEqual(1);
    expect(lastBucket.logRecords).toBeGreaterThanOrEqual(1);
  });

  it("reads a project the organization does not own as not found", async () => {
    await request(app.getHttpServer())
      .get(
        `/api/v1/orgs/${DEFAULT_ORGANIZATION_SLUG}/projects/11111111-2222-4333-8444-555555555555/dashboard-summary`,
      )
      .set("cookie", viewer)
      .expect(404);
  });

  it("refuses a caller with no session", async () => {
    await request(app.getHttpServer()).get(SUMMARY_URL).expect(401);
  });

  it("serves the generated OpenAPI document with the dashboard contract", async () => {
    const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

    expect(
      response.body.paths["/api/v1/orgs/{orgSlug}/projects/{projectId}/dashboard-summary"].get,
    ).toEqual(expect.any(Object));
    expect(response.body.components.schemas).toEqual(
      expect.objectContaining({
        ProjectDashboardSummaryV1: expect.any(Object),
      }),
    );
  });
});
