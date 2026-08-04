import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { DEFAULT_ORGANIZATION_SLUG } from "../src/organizations/default-organization";
import { DEFAULT_PROJECT_ID } from "../src/projects/default-project";
import {
  OTLP_TRACE_EXAMPLE_TRACE_ID,
  otlpRootSpanExample,
  otlpTraceExportExample,
} from "../src/tracing/otlp-trace.examples";
import { signIn } from "./viewer-session";

const PROJECTS_URL = `/api/v1/orgs/${DEFAULT_ORGANIZATION_SLUG}/projects`;

describe("Span ingestion", () => {
  let app: INestApplication;
  let database: PrismaService;
  let ownerCookie: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  async function createProject(name: string): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(PROJECTS_URL)
      .set("cookie", ownerCookie)
      .send({ name })
      .expect(201);
    createdProjectIds.push(response.body.id);
    return response.body;
  }

  async function issueToken(projectId: string): Promise<{ token: string }> {
    const response = await request(app.getHttpServer())
      .post(`${PROJECTS_URL}/${projectId}/tokens`)
      .set("cookie", ownerCookie)
      .send({ name: "production" })
      .expect(201);
    return response.body;
  }

  function exportTo(url: string) {
    return request(app.getHttpServer()).post(url).set("content-type", "application/json");
  }

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);

    const signedIn = await signIn(database);
    createdUserIds.push(signedIn.userId);
    ownerCookie = signedIn.cookie;
  });

  beforeEach(async () => {
    await database.span.deleteMany({ where: { traceId: OTLP_TRACE_EXAMPLE_TRACE_ID } });
  });

  afterAll(async () => {
    await database.span.deleteMany({ where: { traceId: OTLP_TRACE_EXAMPLE_TRACE_ID } });
    await database.projectToken.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await database.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it("stores an exported trace as a tree of spans", async () => {
    const response = await exportTo("/api/v1/traces").send(otlpTraceExportExample).expect(200);

    // OTLP's success body, which is not the same thing as an empty body.
    expect(response.body).toEqual({ partialSuccess: {} });

    const stored = await database.span.findMany({
      where: { traceId: OTLP_TRACE_EXAMPLE_TRACE_ID },
      orderBy: { startedAt: "asc" },
    });

    expect(stored).toHaveLength(3);
    expect(stored.map((span) => [span.spanId, span.parentSpanId])).toEqual([
      ["00f067aa0ba902b7", null],
      ["1a2b3c4d5e6f7081", "00f067aa0ba902b7"],
      ["91827364554637f0", "1a2b3c4d5e6f7081"],
    ]);
    expect(stored[0]).toMatchObject({
      name: "POST /checkout",
      kind: "server",
      statusCode: "unset",
      serviceName: "checkout-api",
      environment: "production",
      release: "2026.07.25.1",
      scopeName: "@dolshoe/node",
      startTimeUnixNano: 1_784_957_401_000_000_000n,
      durationNanoseconds: 412_000_000n,
      attributes: { "http.request.method": "POST", "http.response.status_code": 500 },
    });
    expect(stored[2]).toMatchObject({
      kind: "internal",
      statusCode: "error",
      statusMessage: "connection reset by peer",
    });
  });

  it("changes nothing when an exporter retries the same batch", async () => {
    await exportTo("/api/v1/traces").send(otlpTraceExportExample).expect(200);
    await exportTo("/api/v1/traces").send(otlpTraceExportExample).expect(200);

    await expect(
      database.span.count({ where: { traceId: OTLP_TRACE_EXAMPLE_TRACE_ID } }),
    ).resolves.toBe(3);
  });

  // Failing the request instead would have the exporter retry a batch the server
  // has already judged unreadable, forever.
  it("keeps the readable spans of a batch and counts the rest", async () => {
    const response = await exportTo("/api/v1/traces")
      .send({
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }],
            },
            scopeSpans: [
              {
                spans: [otlpRootSpanExample, { ...otlpRootSpanExample, spanId: "not-a-span-id" }],
              },
            ],
          },
        ],
      })
      .expect(200);

    expect(response.body).toEqual({
      partialSuccess: { rejectedSpans: "1", errorMessage: expect.any(String) },
    });
    await expect(
      database.span.count({ where: { traceId: OTLP_TRACE_EXAMPLE_TRACE_ID } }),
    ).resolves.toBe(1);
  });

  it("accepts an empty export, which is what an idle exporter sends", async () => {
    const response = await exportTo("/api/v1/traces").send({ resourceSpans: [] }).expect(200);

    expect(response.body).toEqual({ partialSuccess: {} });
  });

  it.each([
    ["the project-scoped path a DSN derives", (id: string) => `/api/v1/projects/${id}/traces`],
    [
      "the path a generic OTLP endpoint appends to",
      (id: string) => `/api/v1/projects/${id}/otlp/v1/traces`,
    ],
  ])("ingests through %s", async (_label, path) => {
    const project = await createProject(`Checkout ${Math.random().toString(36).slice(2, 8)}`);
    const { token } = await issueToken(project.id);

    await exportTo(path(project.id))
      .set("authorization", `Bearer ${token}`)
      .send(otlpTraceExportExample)
      .expect(200);

    await expect(database.span.count({ where: { projectId: project.id } })).resolves.toBe(3);
  });

  it("refuses a token presented for someone else's project", async () => {
    const owner = await createProject(`Owner ${Math.random().toString(36).slice(2, 8)}`);
    const other = await createProject(`Other ${Math.random().toString(36).slice(2, 8)}`);
    const { token } = await issueToken(owner.id);

    await exportTo(`/api/v1/projects/${other.id}/traces`)
      .set("authorization", `Bearer ${token}`)
      .send(otlpTraceExportExample)
      .expect(403);

    await expect(database.span.count({ where: { projectId: other.id } })).resolves.toBe(0);
  });

  // The protocol most exporters default to. Without the guard this would fail as
  // a malformed body, telling the operator nothing useful.
  it("refuses a protobuf export and names the setting that fixes it", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/traces")
      .set("content-type", "application/x-protobuf")
      .send(Buffer.from([0x0a, 0x00]))
      .expect(415);

    expect(response.body.message).toMatch(/OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http\/json/);
  });

  it("rejects a body that is not an OTLP export at all", async () => {
    const response = await exportTo("/api/v1/traces").send({ resourceSpans: "nope" }).expect(400);

    expect(response.body).toMatchObject({
      message: "Request body does not match the OTLP trace export contract.",
    });
  });

  it("rejects JSON request bodies larger than 1 MiB", async () => {
    await exportTo("/api/v1/traces")
      .send({
        resourceSpans: [
          {
            scopeSpans: [{ spans: [{ ...otlpRootSpanExample, name: "x".repeat(1024 * 1024) }] }],
          },
        ],
      })
      .expect(413);
  });

  describe("reading traces back", () => {
    const TRACES_URL = `${PROJECTS_URL}/${DEFAULT_PROJECT_ID}/traces`;

    beforeEach(async () => {
      await exportTo("/api/v1/traces").send(otlpTraceExportExample).expect(200);
    });

    it("lists a trace summarized by its root span", async () => {
      const response = await request(app.getHttpServer())
        .get(TRACES_URL)
        .set("cookie", ownerCookie)
        .expect(200);

      expect(response.body.traces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            traceId: OTLP_TRACE_EXAMPLE_TRACE_ID,
            rootSpanId: "00f067aa0ba902b7",
            name: "POST /checkout",
            kind: "server",
            serviceName: "checkout-api",
            environment: "production",
            durationNanoseconds: 412_000_000,
            spanCount: 3,
            errorSpanCount: 1,
          }),
        ]),
      );
    });

    it("returns one trace's spans in the order a waterfall draws them", async () => {
      const response = await request(app.getHttpServer())
        .get(`${TRACES_URL}/${OTLP_TRACE_EXAMPLE_TRACE_ID}`)
        .set("cookie", ownerCookie)
        .expect(200);

      expect(response.body.trace).toMatchObject({
        traceId: OTLP_TRACE_EXAMPLE_TRACE_ID,
        spanCount: 3,
        durationNanoseconds: 412_000_000,
        truncated: false,
      });
      expect(response.body.spans.map((span: { depth: number }) => span.depth)).toEqual([0, 1, 2]);
      expect(
        response.body.spans.map(
          (span: { startOffsetNanoseconds: number }) => span.startOffsetNanoseconds,
        ),
      ).toEqual([0, 20_000_000, 40_000_000]);
      expect(response.body.spans[2]).toMatchObject({
        name: "db.query",
        statusCode: "error",
        statusMessage: "connection reset by peer",
        attributes: { "db.system.name": "postgresql" },
      });
    });

    it("reads a trace nobody reported as an empty one rather than a 404", async () => {
      const response = await request(app.getHttpServer())
        .get(`${TRACES_URL}/${"f".repeat(32)}`)
        .set("cookie", ownerCookie)
        .expect(200);

      expect(response.body.spans).toEqual([]);
      expect(response.body.trace.spanCount).toBe(0);
    });

    it("refuses a trace id that is not 16 bytes of hex", async () => {
      await request(app.getHttpServer())
        .get(`${TRACES_URL}/not-a-trace-id`)
        .set("cookie", ownerCookie)
        .expect(400);
    });

    it("does not reach a project through an organization that does not own it", async () => {
      const stranger = await createProject(`Stranger ${Math.random().toString(36).slice(2, 8)}`);

      const response = await request(app.getHttpServer())
        .get(`${PROJECTS_URL}/${stranger.id}/traces`)
        .set("cookie", ownerCookie)
        .expect(200);

      expect(response.body.traces).toEqual([]);
    });

    it("needs a session", async () => {
      await request(app.getHttpServer()).get(TRACES_URL).expect(401);
      await request(app.getHttpServer())
        .get(`${TRACES_URL}/${OTLP_TRACE_EXAMPLE_TRACE_ID}`)
        .expect(401);
    });
  });

  it("publishes the OTLP trace contract in OpenAPI", async () => {
    const response = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);

    expect(response.body.paths["/api/v1/traces"].post).toEqual(expect.any(Object));
    expect(response.body.paths["/api/v1/traces"].get).toBeUndefined();
    expect(response.body.paths[`/api/v1/projects/{projectId}/otlp/v1/traces`].post).toEqual(
      expect.any(Object),
    );
    expect(response.body.paths["/api/v1/orgs/{orgSlug}/projects/{projectId}/traces"].get).toEqual(
      expect.any(Object),
    );
    expect(response.body.components.schemas).toEqual(
      expect.objectContaining({
        OtlpExportTraceServiceRequest: expect.any(Object),
        OtlpExportTraceServiceResponse: expect.any(Object),
        OtlpSpan: expect.any(Object),
        TraceListResponseV1: expect.any(Object),
        TraceSummaryV1: expect.any(Object),
        TraceDetailResponseV1: expect.any(Object),
        TraceSpanV1: expect.any(Object),
      }),
    );
  });
});
