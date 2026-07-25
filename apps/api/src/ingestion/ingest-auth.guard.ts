import { timingSafeEqual } from "node:crypto";

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { appConfig } from "../config/app-config";

function tokensMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

@Injectable()
export class IngestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedToken = appConfig.ingestToken;
    if (expectedToken == null) return true;

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string | string[] };
    }>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? undefined : authorization;
    const token = value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;

    if (token == null || !tokensMatch(token, expectedToken)) {
      throw new UnauthorizedException("A valid ingestion bearer token is required.");
    }

    return true;
  }
}
