import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { GitHubOAuthClient } from "../src/auth/github-oauth.client";
import { configureApplication } from "../src/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { MembershipRole } from "../src/generated/prisma/client";
import { generateInvitationToken } from "../src/organizations/invitation-token";
import { FakeGitHub, identity, signInWithGitHub } from "./fake-github";
import { signIn } from "./viewer-session";

function uniqueLogin(): string {
  return `invitee-${randomUUID().slice(0, 8)}`;
}

function tokenFromUrl(invitationUrl: string): string {
  return invitationUrl.replace("/invitations/", "");
}

describe("Invitations", () => {
  let app: INestApplication;
  let database: PrismaService;
  let github: FakeGitHub;
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
    githubLogin: string,
    role: MembershipRole = MembershipRole.MEMBER,
    cookie = ownerCookie,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", cookie)
      .send({ githubLogin, role })
      .expect(201);
    return response.body;
  }

  /**
   * Redeems a link the way somebody without an account does: by signing in with
   * the GitHub account it names.
   */
  async function acceptThroughGitHub(githubLogin: string, invitationUrl: string) {
    const result = await signInWithGitHub(app, github, identity({ githubLogin }), {
      invitation: tokenFromUrl(invitationUrl),
    });

    const created = await database.user.findFirst({
      where: { githubLogin },
      select: { id: true },
    });
    if (created != null) createdUserIds.push(created.id);

    return result;
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
    const githubLogin = uniqueLogin();
    const issued = await invite(githubLogin);

    expect(issued.invitationUrl).toContain("/invitations/dsi_");
    expect(issued).toMatchObject({
      githubLogin,
      role: "MEMBER",
      acceptedAt: null,
      revokedAt: null,
    });

    const stored = await database.invitation.findUnique({ where: { id: issued.id } });
    expect(JSON.stringify(stored)).not.toContain(tokenFromUrl(issued.invitationUrl));

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", ownerCookie)
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(tokenFromUrl(issued.invitationUrl));
  });

  it("lowercases the login, so a link survives however the handle was typed", async () => {
    const githubLogin = uniqueLogin();
    const issued = await invite(githubLogin.toUpperCase());

    expect(issued.githubLogin).toBe(githubLogin);
  });

  it("creates the account and the membership when redeemed through GitHub", async () => {
    const githubLogin = uniqueLogin();
    const issued = await invite(githubLogin, MembershipRole.ADMIN);

    const { location, sessionCookie } = await acceptThroughGitHub(
      githubLogin,
      issued.invitationUrl,
    );

    // Signed in and delivered to the organization they joined, in one step.
    expect(location).toBe(`/orgs/${organizationSlug}/projects`);
    expect(sessionCookie).toContain("dsv_");

    const created = await database.user.findFirst({ where: { githubLogin }, select: { id: true } });
    const membership = await database.membership.findFirst({
      where: { organizationId, userId: created?.id },
      select: { role: true },
    });
    expect(membership?.role).toBe("ADMIN");
  });

  it("refuses a GitHub account the invitation does not name", async () => {
    // Otherwise forwarding a link would quietly add whoever opened it.
    const issued = await invite(uniqueLogin());

    const { location, sessionCookie } = await signInWithGitHub(app, github, identity(), {
      invitation: tokenFromUrl(issued.invitationUrl),
    });

    expect(location).toBe("/login?error=invitation_mismatch");
    // Checked before anything is created, so a bad link leaves nothing behind.
    expect(sessionCookie).toBeUndefined();
    expect(await database.invitation.findUnique({ where: { id: issued.id } })).toMatchObject({
      acceptedAt: null,
    });
  });

  it("refuses to let one link be used twice", async () => {
    const githubLogin = uniqueLogin();
    const issued = await invite(githubLogin);

    await acceptThroughGitHub(githubLogin, issued.invitationUrl);

    const { location } = await signInWithGitHub(app, github, identity({ githubLogin }), {
      invitation: tokenFromUrl(issued.invitationUrl),
    });
    expect(location).toBe("/login?error=invitation_invalid");
  });

  it("refuses a revoked link", async () => {
    const githubLogin = uniqueLogin();
    const issued = await invite(githubLogin);

    await request(app.getHttpServer())
      .post(`/api/v1/orgs/${organizationSlug}/invitations/${issued.id}/revoke`)
      .set("cookie", ownerCookie)
      .expect(200);

    const { location } = await signInWithGitHub(app, github, identity({ githubLogin }), {
      invitation: tokenFromUrl(issued.invitationUrl),
    });

    expect(location).toBe("/login?error=invitation_invalid");
  });

  it("refuses an expired link", async () => {
    const githubLogin = uniqueLogin();
    const issued = await invite(githubLogin);
    await database.invitation.update({
      where: { id: issued.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const { location } = await signInWithGitHub(app, github, identity({ githubLogin }), {
      invitation: tokenFromUrl(issued.invitationUrl),
    });

    expect(location).toBe("/login?error=invitation_invalid");
  });

  it("refuses a link that was never issued", async () => {
    const { location } = await signInWithGitHub(app, github, identity(), {
      invitation: generateInvitationToken().raw,
    });

    expect(location).toBe("/login?error=invitation_invalid");
  });

  it("adds a signed-in account to another organization", async () => {
    const joiner = await signIn(database, { organizationId, role: MembershipRole.MEMBER });
    createdUserIds.push(joiner.userId);

    const other = await request(app.getHttpServer())
      .post("/api/v1/orgs")
      .set("cookie", ownerCookie)
      .send({ name: `Second ${randomUUID().slice(0, 8)}` })
      .expect(201);
    createdOrganizationIds.push(other.body.id);

    const issued = await request(app.getHttpServer())
      .post(`/api/v1/orgs/${other.body.slug}/invitations`)
      .set("cookie", ownerCookie)
      .send({ githubLogin: joiner.githubLogin, role: "MEMBER" })
      .expect(201);

    const accepted = await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .set("cookie", joiner.cookie)
      .send({ token: tokenFromUrl(issued.body.invitationUrl) })
      .expect(200);

    expect(accepted.body).toEqual({ organizationSlug: other.body.slug });
  });

  it("refuses a signed-in caller the invitation does not name", async () => {
    const stranger = await signInAs(MembershipRole.OWNER);
    const issued = await invite(uniqueLogin());

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .set("cookie", stranger)
      .send({ token: tokenFromUrl(issued.invitationUrl) })
      .expect(403);
  });

  it("refuses a signed-out caller: only GitHub can say who is asking", async () => {
    const issued = await invite(uniqueLogin());

    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({ token: tokenFromUrl(issued.invitationUrl) })
      .expect(401);
  });

  it("withdraws an outstanding invitation when the same login is re-invited", async () => {
    const githubLogin = uniqueLogin();
    const first = await invite(githubLogin);
    const second = await invite(githubLogin);

    const stale = await signInWithGitHub(app, github, identity({ githubLogin }), {
      invitation: tokenFromUrl(first.invitationUrl),
    });
    expect(stale.location).toBe("/login?error=invitation_invalid");

    const fresh = await acceptThroughGitHub(githubLogin, second.invitationUrl);
    expect(fresh.location).toBe(`/orgs/${organizationSlug}/projects`);
  });

  it("refuses to invite someone who is already a member", async () => {
    const existing = await signIn(database, { organizationId, role: MembershipRole.MEMBER });
    createdUserIds.push(existing.userId);

    await request(app.getHttpServer())
      .post(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", ownerCookie)
      .send({ githubLogin: existing.githubLogin, role: "MEMBER" })
      .expect(409);
  });

  it("rejects something that is not a GitHub login at all", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", ownerCookie)
      .send({ githubLogin: "colleague@example.com", role: "MEMBER" })
      .expect(400);
  });

  it("keeps invitations to an admin's own organization", async () => {
    const admin = await signInAs(MembershipRole.ADMIN, organizationId);
    const member = await signInAs(MembershipRole.MEMBER, organizationId);

    await invite(uniqueLogin(), MembershipRole.MEMBER, admin);

    // A member may not see who has been invited: the list names GitHub accounts
    // that have not joined yet.
    await request(app.getHttpServer())
      .get(`/api/v1/orgs/${organizationSlug}/invitations`)
      .set("cookie", member)
      .expect(403);
  });
});
