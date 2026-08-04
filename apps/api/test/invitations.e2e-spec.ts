import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { SESSION_COOKIE_NAME } from "../src/auth/session-cookie";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { MembershipRole } from "../src/generated/prisma/client";
import { generateInvitationToken } from "../src/organizations/invitation-token";
import { signIn } from "./viewer-session";

const PASSWORD = "correct horse battery staple";

function uniqueEmail(): string {
  return `invitee-${randomUUID().slice(0, 8)}@example.com`;
}

function tokenFromUrl(invitationUrl: string): string {
  return invitationUrl.replace("/invitations/", "");
}

describe("Invitations", () => {
  let app: INestApplication;
  let database: PrismaService;
  let ownerCookie: string;
  let organizationSlug: string;
  let organizationId: string;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  async function signInAs(role: MembershipRole, orgId?: string): Promise<string> {
    const signedIn = await signIn(database, { organizationId: orgId, role });
    createdUserIds.push(signedIn.userId);
    return signedIn.cookie;
  }

  async function invite(
    email: string,
    role: MembershipRole = MembershipRole.MEMBER,
    cookie = ownerCookie,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", cookie)
      .send({ email, role })
      .expect(201);
    return response.body;
  }

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
    database = app.get(PrismaService);

    ownerCookie = await signInAs(MembershipRole.OWNER);
  });

  beforeEach(async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("cookie", ownerCookie)
      .send({ name: `Invites ${randomUUID().slice(0, 8)}` })
      .expect(201);

    organizationId = created.body.id;
    organizationSlug = created.body.slug;
    createdOrganizationIds.push(organizationId);
  });

  afterEach(async () => {
    // Invitations and memberships cascade from the organization that owns them.
    await database.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    createdOrganizationIds.length = 0;
  });

  afterAll(async () => {
    // Restrict on Invitation -> User (invitedBy) means the invitations have to
    // be gone before the accounts that issued them, which the cascade above has
    // already taken care of.
    await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it("returns a one-time link and stores only its digest", async () => {
    const email = uniqueEmail();
    const issued = await invite(email);

    expect(issued.invitationUrl).toContain("/invitations/dsi_");
    expect(issued).toMatchObject({ email, role: "MEMBER", acceptedAt: null, revokedAt: null });

    const stored = await database.invitation.findUnique({ where: { id: issued.id } });
    expect(JSON.stringify(stored)).not.toContain(tokenFromUrl(issued.invitationUrl));

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", ownerCookie)
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(tokenFromUrl(issued.invitationUrl));
  });

  it("creates the account and the membership when accepted while signed out", async () => {
    const email = uniqueEmail();
    const issued = await invite(email, MembershipRole.ADMIN);

    const accepted = await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromUrl(issued.invitationUrl), name: "Invitee", password: PASSWORD })
      .expect(200);

    expect(accepted.body).toEqual({ organizationSlug });
    // Signed in by the same response, so accepting and arriving are one step.
    expect((accepted.get("Set-Cookie") ?? []).join("; ")).toContain(`${SESSION_COOKIE_NAME}=dsv_`);

    const created = await database.user.findUnique({ where: { email }, select: { id: true } });
    createdUserIds.push(created?.id ?? "");
    const membership = await database.membership.findFirst({
      where: { organizationId, userId: created?.id },
      select: { role: true },
    });
    expect(membership?.role).toBe("ADMIN");
  });

  it("refuses to let one link be used twice", async () => {
    const email = uniqueEmail();
    const issued = await invite(email);
    const token = tokenFromUrl(issued.invitationUrl);

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, name: "Invitee", password: PASSWORD })
      .expect(200);

    const created = await database.user.findUnique({ where: { email }, select: { id: true } });
    createdUserIds.push(created?.id ?? "");

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token, name: "Invitee", password: PASSWORD })
      .expect(404);
  });

  it("refuses a revoked link", async () => {
    const issued = await invite(uniqueEmail());

    await request(app.getHttpServer())
      .post(`/api/v1/orgs/${organizationSlug}/invitations/${issued.id}/revoke`)
      .set("cookie", ownerCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromUrl(issued.invitationUrl), name: "Invitee", password: PASSWORD })
      .expect(404);
  });

  it("refuses an expired link", async () => {
    const issued = await invite(uniqueEmail());
    await database.invitation.update({
      where: { id: issued.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromUrl(issued.invitationUrl), name: "Invitee", password: PASSWORD })
      .expect(404);
  });

  it("refuses a link that was never issued", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: generateInvitationToken().raw, name: "Invitee", password: PASSWORD })
      .expect(404);
  });

  it("refuses a signed-in caller whose address the invitation does not name", async () => {
    // Otherwise forwarding a link would quietly add whoever opened it.
    const stranger = await signInAs(MembershipRole.OWNER);
    const issued = await invite(uniqueEmail());

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .set("cookie", stranger)
      .send({ token: tokenFromUrl(issued.invitationUrl) })
      .expect(403);
  });

  it("withdraws an outstanding invitation when the same address is re-invited", async () => {
    const email = uniqueEmail();
    const first = await invite(email);
    const second = await invite(email);

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromUrl(first.invitationUrl), name: "Invitee", password: PASSWORD })
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromUrl(second.invitationUrl), name: "Invitee", password: PASSWORD })
      .expect(200);

    const created = await database.user.findUnique({ where: { email }, select: { id: true } });
    createdUserIds.push(created?.id ?? "");
  });

  it("refuses to invite someone who is already a member", async () => {
    await signInAs(MembershipRole.MEMBER, organizationId);

    const members = await request(app.getHttpServer())
      .get(`/api/v1/orgs/${organizationSlug}/members`)
      .set("cookie", ownerCookie)
      .expect(200);
    const existing = members.body.members.find(
      (candidate: { role: string }) => candidate.role === "MEMBER",
    );

    await request(app.getHttpServer())
      .post(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", ownerCookie)
      .send({ email: existing.email, role: "MEMBER" })
      .expect(409);
  });

  it("keeps invitations to an admin's own organization", async () => {
    const admin = await signInAs(MembershipRole.ADMIN, organizationId);
    const member = await signInAs(MembershipRole.MEMBER, organizationId);

    await invite(uniqueEmail(), MembershipRole.MEMBER, admin);

    // A member may not see who has been invited: the list names addresses that
    // have not joined yet.
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", member)
      .expect(403);
  });
});
