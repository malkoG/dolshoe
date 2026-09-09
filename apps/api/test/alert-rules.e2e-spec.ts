import { randomUUID } from "node:crypto";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { nodeErrorReportExample } from "../src/error-reporting/error-report.examples";
import { MembershipRole } from "../src/generated/prisma/client";
import { signIn } from "./viewer-session";

function uniqueName(label: string): string {
  return `${label} ${randomUUID().slice(0, 8)}`;
}

/** A tiny local HTTP server standing in for a Slack/webhook receiver. */
function captureServer(): {
  server: Server;
  url: () => string;
  requests: () => unknown[];
} {
  const requests: unknown[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      res.writeHead(200);
      res.end();
    });
  });

  return {
    server,
    url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    requests: () => requests,
  };
}

describe("Alert rules", () => {
  let app: INestApplication;
  let database: PrismaService;
  let ownerCookie: string;
  const createdProjectIds: string[] = [];
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createOrganization(name: string): Promise<{ id: string; slug: string }> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("cookie", ownerCookie)
      .send({ name })
      .expect(201);
    createdOrganizationIds.push(response.body.id);
    return response.body;
  }

  async function createProject(
    orgSlug: string,
    name: string,
  ): Promise<{ id: string; slug: string }> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgSlug}/projects`)
      .set("cookie", ownerCookie)
      .send({ name })
      .expect(201);
    createdProjectIds.push(response.body.id);
    return response.body;
  }

  async function issueToken(orgSlug: string, projectId: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${orgSlug}/projects/${projectId}/tokens`)
      .set("cookie", ownerCookie)
      .send({ name: "test" })
      .expect(201);
    return response.body.token as string;
  }

  async function signInAs(role: MembershipRole, organizationId: string): Promise<string> {
    const signedIn = await signIn(database, { organizationId, role });
    createdUserIds.push(signedIn.userId);
    return signedIn.cookie;
  }

  function ingest(token: string, projectId: string, report: object): request.Test {
    return request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/error-reports`)
      .set("authorization", `Bearer ${token}`)
      .send(report);
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
    ownerCookie = signedIn.cookie;
    createdUserIds.push(signedIn.userId);
  });

  afterEach(async () => {
    const where = { projectId: { in: createdProjectIds } };
    await database.alertRule.deleteMany({ where });
    await database.errorReport.deleteMany({ where });
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

  describe("CRUD", () => {
    it("creates a rule of each condition type, then lists them newest-first", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const rulesUrl = `/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`;

      const newFingerprint = await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "new_fingerprint",
          name: "New errors",
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(201);
      expect(newFingerprint.body).toMatchObject({
        conditionType: "new_fingerprint",
        enabled: true,
        cooldownMinutes: 30,
        lastFiredAt: null,
      });

      const filterMatch = await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "filter_match",
          name: "Production errors",
          environment: "production",
          channels: [{ type: "slack", webhookUrl: "https://hooks.slack.test/x" }],
        })
        .expect(201);
      expect(filterMatch.body).toMatchObject({ conditionType: "filter_match" });

      const volumeThreshold = await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "volume_threshold",
          name: "Error burst",
          thresholdCount: 10,
          thresholdWindowMinutes: 5,
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(201);
      expect(volumeThreshold.body).toMatchObject({
        conditionType: "volume_threshold",
        thresholdCount: 10,
        thresholdWindowMinutes: 5,
      });

      const listed = await request(app.getHttpServer())
        .get(rulesUrl)
        .set("cookie", ownerCookie)
        .expect(200);
      expect(listed.body.rules.map((rule: { id: string }) => rule.id)).toEqual([
        volumeThreshold.body.id,
        filterMatch.body.id,
        newFingerprint.body.id,
      ]);
    });

    it("rejects volume_threshold fields on a non-volume_threshold rule, and a missing threshold on one", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const rulesUrl = `/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`;

      await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "new_fingerprint",
          name: "New errors",
          thresholdCount: 10,
          thresholdWindowMinutes: 5,
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "volume_threshold",
          name: "Error burst",
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(400);
    });

    it("updates a rule's name and enabled flag", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const rulesUrl = `/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`;

      const created = await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "filter_match",
          name: "Original name",
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`${rulesUrl}/${created.body.id}`)
        .set("cookie", ownerCookie)
        .send({ name: "Renamed", enabled: false })
        .expect(200);
      expect(updated.body).toMatchObject({ name: "Renamed", enabled: false });
    });

    it("deletes a rule", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const rulesUrl = `/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`;

      const created = await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "filter_match",
          name: "To delete",
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`${rulesUrl}/${created.body.id}`)
        .set("cookie", ownerCookie)
        .expect(204);

      const listed = await request(app.getHttpServer())
        .get(rulesUrl)
        .set("cookie", ownerCookie)
        .expect(200);
      expect(listed.body.rules).toEqual([]);
    });

    it("refuses a member on every write route, but lets one read", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const rulesUrl = `/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`;
      const memberCookie = await signInAs(MembershipRole.MEMBER, org.id);

      await request(app.getHttpServer())
        .post(rulesUrl)
        .set("cookie", memberCookie)
        .send({
          conditionType: "filter_match",
          name: "Nope",
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(403);

      await request(app.getHttpServer()).get(rulesUrl).set("cookie", memberCookie).expect(200);
    });

    it("hides a rule reached through a foreign organization behind a 404", async () => {
      const orgA = await createOrganization(uniqueName("Acme A"));
      const orgB = await createOrganization(uniqueName("Acme B"));
      const projectA = await createProject(orgA.slug, uniqueName("Checkout"));

      const created = await request(app.getHttpServer())
        .post(`/api/v1/orgs/${orgA.slug}/projects/${projectA.id}/alert-rules`)
        .set("cookie", ownerCookie)
        .send({
          conditionType: "filter_match",
          name: "Scoped",
          channels: [{ type: "webhook", url: "https://example.com/hook" }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/orgs/${orgB.slug}/projects/${projectA.id}/alert-rules/${created.body.id}`)
        .set("cookie", ownerCookie)
        .send({ enabled: false })
        .expect(404);
    });
  });

  describe("evaluation", () => {
    it("fires a new_fingerprint rule once for a genuinely new fingerprint, and not again for the same one", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const token = await issueToken(org.slug, project.id);
      const capture = captureServer();
      await new Promise<void>((resolve) => capture.server.listen(0, resolve));

      try {
        await request(app.getHttpServer())
          .post(`/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`)
          .set("cookie", ownerCookie)
          .send({
            conditionType: "new_fingerprint",
            name: "New errors",
            channels: [{ type: "webhook", url: capture.url() }],
          })
          .expect(201);

        await ingest(token, project.id, {
          ...nodeErrorReportExample,
          eventId: randomUUID(),
        }).expect(201);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(capture.requests()).toHaveLength(1);

        const rules = await request(app.getHttpServer())
          .get(`/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`)
          .set("cookie", ownerCookie)
          .expect(200);
        expect(rules.body.rules[0].lastFiredAt).not.toBeNull();

        // Same exception shape, so the same fingerprint — no longer "new".
        await ingest(token, project.id, {
          ...nodeErrorReportExample,
          eventId: randomUUID(),
        }).expect(201);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(capture.requests()).toHaveLength(1);
      } finally {
        await new Promise((resolve) => capture.server.close(resolve));
      }
    });

    it("does not fire again for an idempotent replay of the same eventId", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const token = await issueToken(org.slug, project.id);
      const capture = captureServer();
      await new Promise<void>((resolve) => capture.server.listen(0, resolve));

      try {
        await request(app.getHttpServer())
          .post(`/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`)
          .set("cookie", ownerCookie)
          .send({
            conditionType: "new_fingerprint",
            name: "New errors",
            channels: [{ type: "webhook", url: capture.url() }],
          })
          .expect(201);

        const report = { ...nodeErrorReportExample, eventId: randomUUID() };
        await ingest(token, project.id, report).expect(201);
        await ingest(token, project.id, report).expect(201);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(capture.requests()).toHaveLength(1);
      } finally {
        await new Promise((resolve) => capture.server.close(resolve));
      }
    });

    it("fires a volume_threshold rule once the count is reached, and stays quiet through its cooldown", async () => {
      const org = await createOrganization(uniqueName("Acme"));
      const project = await createProject(org.slug, uniqueName("Checkout"));
      const token = await issueToken(org.slug, project.id);
      const capture = captureServer();
      await new Promise<void>((resolve) => capture.server.listen(0, resolve));

      try {
        await request(app.getHttpServer())
          .post(`/api/v1/orgs/${org.slug}/projects/${project.id}/alert-rules`)
          .set("cookie", ownerCookie)
          .send({
            conditionType: "volume_threshold",
            name: "Burst",
            thresholdCount: 3,
            thresholdWindowMinutes: 60,
            cooldownMinutes: 60,
            channels: [{ type: "webhook", url: capture.url() }],
          })
          .expect(201);

        // Different exceptions each time, so new_fingerprint-style dedup
        // cannot be what stops this from firing early.
        for (let index = 0; index < 3; index++) {
          await ingest(token, project.id, {
            ...nodeErrorReportExample,
            eventId: randomUUID(),
            exception: { ...nodeErrorReportExample.exception, message: `failure #${index}` },
          }).expect(201);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(capture.requests()).toHaveLength(1);

        // A fourth report keeps the count at/above threshold, but the
        // cooldown from the first fire is still active.
        await ingest(token, project.id, {
          ...nodeErrorReportExample,
          eventId: randomUUID(),
        }).expect(201);
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(capture.requests()).toHaveLength(1);
      } finally {
        await new Promise((resolve) => capture.server.close(resolve));
      }
    });
  });
});
