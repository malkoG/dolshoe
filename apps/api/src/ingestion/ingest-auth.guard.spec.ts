import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";

import { appConfig } from "../config/app-config";
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_SLUG } from "../projects/default-project";
import { generateProjectToken } from "../projects/project-token";
import { ProjectTokenVerifier } from "../projects/project-token.verifier";
import { IngestAuthGuard } from "./ingest-auth.guard";
import { readIngestedProject } from "./ingested-project";

const LEGACY_TOKEN = "0123456789abcdef0123456789abcdef";
const OWNING_PROJECT = { id: "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e", slug: "checkout-api" };
const DEFAULT_PROJECT = { id: DEFAULT_PROJECT_ID, slug: DEFAULT_PROJECT_SLUG };

interface TestRequest {
  headers: { authorization?: string };
  params?: Record<string, string>;
}

function requestContext(request: TestRequest): { context: ExecutionContext; request: TestRequest } {
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext,
    request,
  };
}

function guardWith(verify: jest.Mock): IngestAuthGuard {
  return new IngestAuthGuard({ verify } as unknown as ProjectTokenVerifier);
}

function setConfig(overrides: {
  ingestToken?: string | undefined;
  nodeEnvironment?: string;
}): void {
  if ("ingestToken" in overrides) {
    Object.defineProperty(appConfig, "ingestToken", {
      configurable: true,
      value: overrides.ingestToken,
    });
  }
  if (overrides.nodeEnvironment != null) {
    Object.defineProperty(appConfig, "nodeEnvironment", {
      configurable: true,
      value: overrides.nodeEnvironment,
    });
  }
}

describe("IngestAuthGuard", () => {
  const originalToken = appConfig.ingestToken;
  const originalEnvironment = appConfig.nodeEnvironment;

  afterEach(() => {
    setConfig({ ingestToken: originalToken, nodeEnvironment: originalEnvironment });
  });

  it("resolves the legacy ingestion token to the default project without a lookup", async () => {
    setConfig({ ingestToken: LEGACY_TOKEN, nodeEnvironment: "production" });
    const verify = jest.fn();
    const { context, request } = requestContext({
      headers: { authorization: `Bearer ${LEGACY_TOKEN}` },
    });

    await expect(guardWith(verify).canActivate(context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(readIngestedProject(request)).toEqual(DEFAULT_PROJECT);
  });

  it("rejects a wrong token while the legacy token is configured", async () => {
    setConfig({ ingestToken: LEGACY_TOKEN, nodeEnvironment: "production" });
    const { context } = requestContext({ headers: { authorization: "Bearer nope" } });

    await expect(guardWith(jest.fn()).canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("resolves a project token to its own project", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "production" });
    const token = generateProjectToken();
    const verify = jest.fn().mockResolvedValue(OWNING_PROJECT);
    const { context, request } = requestContext({
      headers: { authorization: `Bearer ${token.raw}` },
    });

    await expect(guardWith(verify).canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith(token.raw, token.prefix);
    expect(readIngestedProject(request)).toEqual(OWNING_PROJECT);
  });

  it("propagates a rejected project token", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "development" });
    const token = generateProjectToken();
    const verify = jest.fn().mockRejectedValue(new UnauthorizedException());
    const { context } = requestContext({ headers: { authorization: `Bearer ${token.raw}` } });

    await expect(guardWith(verify).canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("holds a token that claims to be a project token to that claim, even in open mode", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "development" });
    const token = generateProjectToken();
    const verify = jest.fn().mockRejectedValue(new UnauthorizedException());
    const { context } = requestContext({ headers: { authorization: `Bearer ${token.raw}` } });

    await expect(guardWith(verify).canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(verify).toHaveBeenCalled();
  });

  it("allows unauthenticated local ingestion into the default project", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "development" });
    const { context, request } = requestContext({ headers: {} });

    await expect(guardWith(jest.fn()).canActivate(context)).resolves.toBe(true);
    expect(readIngestedProject(request)).toEqual(DEFAULT_PROJECT);
  });

  it("never falls open in production", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "production" });
    const { context } = requestContext({ headers: {} });

    await expect(guardWith(jest.fn()).canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("accepts a scoped route whose path names the token's own project", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "production" });
    const token = generateProjectToken();
    const verify = jest.fn().mockResolvedValue(OWNING_PROJECT);
    const { context, request } = requestContext({
      headers: { authorization: `Bearer ${token.raw}` },
      params: { projectId: OWNING_PROJECT.id },
    });

    await expect(guardWith(verify).canActivate(context)).resolves.toBe(true);
    expect(readIngestedProject(request)).toEqual(OWNING_PROJECT);
  });

  it("refuses a scoped route that names a different project", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "production" });
    const token = generateProjectToken();
    const verify = jest.fn().mockResolvedValue(OWNING_PROJECT);
    const { context, request } = requestContext({
      headers: { authorization: `Bearer ${token.raw}` },
      params: { projectId: "11111111-2222-4333-8444-555555555555" },
    });

    await expect(guardWith(verify).canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(readIngestedProject(request)).toBeUndefined();
  });

  it("refuses a scoped route in open mode when the path is not the default project", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "development" });
    const { context } = requestContext({
      headers: {},
      params: { projectId: "11111111-2222-4333-8444-555555555555" },
    });

    await expect(guardWith(jest.fn()).canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it("skips the path check on routes that do not name a project", async () => {
    setConfig({ ingestToken: undefined, nodeEnvironment: "development" });
    const { context, request } = requestContext({ headers: {}, params: {} });

    await expect(guardWith(jest.fn()).canActivate(context)).resolves.toBe(true);
    expect(readIngestedProject(request)).toEqual(DEFAULT_PROJECT);
  });
});
