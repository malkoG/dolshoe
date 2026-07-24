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

describe("Error report ingestion", () => {
  let app: INestApplication;
  let database: PrismaService;

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);
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
    expect(response.body.components.schemas).toEqual(
      expect.objectContaining({
        ErrorReportRequestV1: expect.any(Object),
        NormalizedExceptionV1: expect.any(Object),
        ErrorReportReceiptV1: expect.any(Object),
      }),
    );
    expect(
      response.body.components.schemas.ErrorReportRequestV1.properties.runtime.properties.name
        .description,
    ).toContain("Runtime family");
  });
});
