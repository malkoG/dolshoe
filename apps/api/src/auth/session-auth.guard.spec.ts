import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";

import { generateProjectToken } from "../projects/project-token";
import { SESSION_COOKIE_NAME } from "./session-cookie";
import { SessionAuthGuard } from "./session-auth.guard";
import { generateSessionToken } from "./session-token";
import { SessionService } from "./session.service";
import { readViewer } from "./viewer";

const VIEWER = {
  id: "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e",
  email: "ops@example.com",
  name: "Ops",
  sessionId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
};

interface TestRequest {
  method?: string;
  headers: {
    authorization?: string;
    cookie?: string | string[];
    origin?: string;
    host?: string;
  };
}

function requestContext(request: TestRequest): { context: ExecutionContext; request: TestRequest } {
  return {
    context: { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext,
    request,
  };
}

function guardWith(verify: jest.Mock): SessionAuthGuard {
  return new SessionAuthGuard({ verify } as unknown as SessionService);
}

describe("SessionAuthGuard", () => {
  it("resolves the viewer and attaches it to the request", async () => {
    const token = generateSessionToken();
    const verify = jest.fn().mockResolvedValue(VIEWER);
    const { context, request } = requestContext({
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token.raw}` },
    });

    await expect(guardWith(verify).canActivate(context)).resolves.toBe(true);

    expect(verify).toHaveBeenCalledWith(token.raw, token.prefix);
    expect(readViewer(request)).toEqual(VIEWER);
  });

  it("refuses a request with no cookie", async () => {
    const verify = jest.fn();
    const { context } = requestContext({ headers: {} });

    await expect(guardWith(verify).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses an ingestion token in the session cookie without a lookup", async () => {
    const verify = jest.fn();
    const { context } = requestContext({
      headers: { cookie: `${SESSION_COOKIE_NAME}=${generateProjectToken().raw}` },
    });

    await expect(guardWith(verify).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // The scheme decided this, not the database.
    expect(verify).not.toHaveBeenCalled();
  });

  it("never reads the Authorization header", async () => {
    const verify = jest.fn();
    // A perfectly good ingestion credential, presented the way ingestion
    // presents it. This guard is not the one that accepts it.
    const { context } = requestContext({
      headers: { authorization: `Bearer ${generateProjectToken().raw}` },
    });

    await expect(guardWith(verify).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("also ignores a session token presented as a bearer rather than a cookie", async () => {
    const verify = jest.fn();
    const { context } = requestContext({
      headers: { authorization: `Bearer ${generateSessionToken().raw}` },
    });

    await expect(guardWith(verify).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin write before looking at the cookie", async () => {
    const verify = jest.fn();
    const { context } = requestContext({
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${generateSessionToken().raw}`,
        origin: "https://attacker.example",
        host: "dolshoe.example",
      },
    });

    await expect(guardWith(verify).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(verify).not.toHaveBeenCalled();
  });

  it("lets the session service decide about a well-formed but unknown token", async () => {
    const verify = jest.fn().mockRejectedValue(new UnauthorizedException());
    const { context } = requestContext({
      headers: { cookie: `${SESSION_COOKIE_NAME}=${generateSessionToken().raw}` },
    });

    await expect(guardWith(verify).canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).toHaveBeenCalled();
  });
});
