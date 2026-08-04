import { timingSafeEqual } from "node:crypto";

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { appConfig } from "../config/app-config";
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_SLUG } from "../projects/default-project";
import { parseProjectTokenPrefix } from "../projects/project-token";
import { ProjectTokenVerifier } from "../projects/project-token.verifier";
import { IngestedProject, attachIngestedProject } from "./ingested-project";

interface IngestRequest {
  headers: { authorization?: string | string[] };
  params?: Record<string, string | undefined>;
}

const DEFAULT_PROJECT: IngestedProject = {
  id: DEFAULT_PROJECT_ID,
  slug: DEFAULT_PROJECT_SLUG,
};

function tokensMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function bearerToken(request: IngestRequest): string | undefined {
  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? undefined : authorization;
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;
}

/**
 * Authenticates an ingestion request and attaches the project it may write to.
 *
 * @remarks
 * Three credentials are accepted, in this order: the legacy process-wide
 * `INGEST_TOKEN`, which resolves to the default project; a per-project token;
 * and, outside production only, no credential at all, which also resolves to the
 * default project so local development needs no setup.
 */
@Injectable()
export class IngestAuthGuard implements CanActivate {
  constructor(private readonly tokenVerifier: ProjectTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IngestRequest>();
    const project = await this.resolveProject(request);

    // A route that names a project in its path must agree with the credential.
    // Enforced here rather than in the controller so the scoped and unscoped
    // routes cannot drift apart.
    const requestedProjectId = request.params?.projectId;
    if (requestedProjectId != null && requestedProjectId !== project.id) {
      throw new ForbiddenException("The presented token does not belong to this project.");
    }

    attachIngestedProject(request, project);
    return true;
  }

  private async resolveProject(request: IngestRequest): Promise<IngestedProject> {
    const token = bearerToken(request);
    const legacyToken = appConfig.ingestToken;

    // Checked before the per-project path so an INGEST_TOKEN that happens to look
    // like a project token still behaves as the legacy credential.
    if (token != null && legacyToken != null && tokensMatch(token, legacyToken)) {
      return DEFAULT_PROJECT;
    }

    if (token != null) {
      const prefix = parseProjectTokenPrefix(token);
      // A token claiming to be a project token is held to it, even in open mode.
      if (prefix != null) return this.tokenVerifier.verify(token, prefix);
    }

    if (legacyToken == null && appConfig.nodeEnvironment !== "production") {
      return DEFAULT_PROJECT;
    }

    throw new UnauthorizedException("A valid ingestion bearer token is required.");
  }
}
