import { ExecutionContext, UnauthorizedException } from "@nestjs/common";

import { appConfig } from "../config/app-config";
import { IngestAuthGuard } from "./ingest-auth.guard";

function requestContext(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization == null ? {} : { authorization },
      }),
    }),
  } as ExecutionContext;
}

describe("IngestAuthGuard", () => {
  const originalToken = appConfig.ingestToken;

  afterEach(() => {
    Object.defineProperty(appConfig, "ingestToken", {
      configurable: true,
      value: originalToken,
    });
  });

  it("allows local ingestion when no token is configured", () => {
    Object.defineProperty(appConfig, "ingestToken", {
      configurable: true,
      value: undefined,
    });

    expect(new IngestAuthGuard().canActivate(requestContext())).toBe(true);
  });

  it("requires the configured bearer token", () => {
    const token = "0123456789abcdef0123456789abcdef";
    Object.defineProperty(appConfig, "ingestToken", {
      configurable: true,
      value: token,
    });
    const guard = new IngestAuthGuard();

    expect(guard.canActivate(requestContext(`Bearer ${token}`))).toBe(true);
    expect(() => guard.canActivate(requestContext("Bearer invalid"))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(requestContext())).toThrow(UnauthorizedException);
  });
});
