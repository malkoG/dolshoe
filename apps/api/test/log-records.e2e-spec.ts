import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { logRecordBatchExample, logRecordExample } from "../src/log-recording/log-record.examples";

describe("Log record ingestion", () => {
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
    await database.logRecord.deleteMany({
      where: {
        eventId: logRecordExample.eventId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("stores a structured batch and makes retries idempotent", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/v1/log-records")
      .send(logRecordBatchExample)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post("/api/v1/log-records")
      .send(logRecordBatchExample)
      .expect(201);

    expect(first.body).toEqual({
      records: [
        {
          eventId: logRecordExample.eventId,
          id: expect.any(String),
          receivedAt: expect.any(String),
        },
      ],
    });
    expect(retry.body).toEqual(first.body);

    const stored = await database.logRecord.findMany({
      where: {
        eventId: logRecordExample.eventId,
      },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      level: "info",
      message: "Payment authorization completed",
      category: ["checkout", "payment"],
      serviceName: "checkout-api",
      runtimeName: "node",
      reporterName: "dolshoe-node",
      attributes: logRecordExample.attributes,
    });
  });

  it("rejects the complete batch when eventIds repeat", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/log-records")
      .send({
        schemaVersion: 1,
        records: [logRecordExample, logRecordExample],
      })
      .expect(400);

    expect(response.body).toMatchObject({
      message: "Request body does not match the log record contract.",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "records.1.eventId",
        }),
      ]),
    });
    await expect(
      database.logRecord.count({ where: { eventId: logRecordExample.eventId } }),
    ).resolves.toBe(0);
  });

  it("rejects JSON request bodies larger than 1 MiB", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/log-records")
      .send({
        schemaVersion: 1,
        records: [
          {
            ...logRecordExample,
            message: "x".repeat(1024 * 1024),
          },
        ],
      })
      .expect(413);
  });

  it("publishes the log record contract in OpenAPI", async () => {
    const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

    expect(response.body.paths["/api/v1/log-records"].post).toEqual(expect.any(Object));
    expect(response.body.components.schemas).toEqual(
      expect.objectContaining({
        LogRecordV1: expect.any(Object),
        LogRecordBatchRequestV1: expect.any(Object),
        LogRecordBatchReceiptV1: expect.any(Object),
      }),
    );
  });
});
