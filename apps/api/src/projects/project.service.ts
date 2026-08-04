import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { deriveProjectSlug } from "./project-slug";
import { generateProjectToken } from "./project-token";
import {
  CreateProjectRequest,
  IssueProjectTokenRequest,
  IssuedProjectToken,
  Project,
  ProjectListResponse,
  ProjectToken,
  ProjectTokenListResponse,
} from "./project.contract";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const FOREIGN_KEY_CONSTRAINT_VIOLATION = "P2003";
const RECORD_NOT_FOUND = "P2025";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

interface ProjectTokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const tokenColumns = {
  id: true,
  name: true,
  prefix: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProjectToken(row: ProjectTokenRow): ProjectToken {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class ProjectService {
  constructor(private readonly database: PrismaService) {}

  async create(request: CreateProjectRequest): Promise<Project> {
    const slug = request.slug ?? this.deriveSlug(request.name);

    try {
      const created = await this.database.project.create({
        data: { slug, name: request.name },
        select: { id: true, slug: true, name: true, createdAt: true },
      });
      return toProject(created);
    } catch (error) {
      if (isPrismaError(error, UNIQUE_CONSTRAINT_VIOLATION)) {
        throw new ConflictException(`A project with the slug "${slug}" already exists.`);
      }
      throw error;
    }
  }

  async list(): Promise<ProjectListResponse> {
    const rows = await this.database.project.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, name: true, createdAt: true },
    });

    return { projects: rows.map(toProject) };
  }

  async listTokens(projectId: string): Promise<ProjectTokenListResponse> {
    await this.requireProject(projectId);

    const rows = await this.database.projectToken.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: tokenColumns,
    });

    return { tokens: rows.map(toProjectToken) };
  }

  /**
   * Issues a token and returns its plaintext. This is the only place the
   * plaintext exists after generation: the row stores only its digest.
   */
  async issueToken(
    projectId: string,
    request: IssueProjectTokenRequest,
  ): Promise<IssuedProjectToken> {
    const token = generateProjectToken();

    try {
      const created = await this.database.projectToken.create({
        data: {
          projectId,
          name: request.name,
          prefix: token.prefix,
          tokenHash: token.hash,
        },
        select: tokenColumns,
      });

      return { ...toProjectToken(created), token: token.raw };
    } catch (error) {
      if (isPrismaError(error, FOREIGN_KEY_CONSTRAINT_VIOLATION)) {
        throw new NotFoundException(`No project exists with the id ${projectId}.`);
      }
      throw error;
    }
  }

  /**
   * Revocation is idempotent: revoking an already-revoked token returns the
   * original timestamp rather than failing a retried or double-clicked request.
   */
  async revokeToken(projectId: string, tokenId: string): Promise<ProjectToken> {
    const existing = await this.database.projectToken.findFirst({
      where: { id: tokenId, projectId },
      select: tokenColumns,
    });

    if (existing == null) {
      throw new NotFoundException(
        `No token exists with the id ${tokenId} in project ${projectId}.`,
      );
    }

    if (existing.revokedAt != null) return toProjectToken(existing);

    try {
      const revoked = await this.database.projectToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
        select: tokenColumns,
      });
      return toProjectToken(revoked);
    } catch (error) {
      if (isPrismaError(error, RECORD_NOT_FOUND)) {
        throw new NotFoundException(
          `No token exists with the id ${tokenId} in project ${projectId}.`,
        );
      }
      throw error;
    }
  }

  private deriveSlug(name: string): string {
    try {
      return deriveProjectSlug(name);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Could not derive a slug from the project name.",
      );
    }
  }

  private async requireProject(projectId: string): Promise<void> {
    const project = await this.database.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (project == null) {
      throw new NotFoundException(`No project exists with the id ${projectId}.`);
    }
  }
}
