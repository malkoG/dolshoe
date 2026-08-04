import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { SpanRow } from "./otlp-spans";

export interface TraceRootRow {
  traceId: string;
  spanId: string;
  name: string;
  kind: string;
  statusCode: string;
  serviceName: string;
  environment: string | null;
  startedAt: Date;
  durationNanoseconds: bigint;
}

export interface TraceCountRow {
  traceId: string;
  total: number;
  errors: number;
}

export interface SpanDetailRow {
  id: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  statusCode: string;
  statusMessage: string | null;
  serviceName: string;
  scopeName: string | null;
  scopeVersion: string | null;
  startedAt: Date;
  startTimeUnixNano: bigint;
  durationNanoseconds: bigint;
  attributes: unknown;
  resourceAttributes: unknown;
}

function spanValues(projectId: string, span: SpanRow): Prisma.Sql {
  const attributes = span.attributes == null ? null : JSON.stringify(span.attributes);
  const resourceAttributes =
    span.resourceAttributes == null ? null : JSON.stringify(span.resourceAttributes);

  // This positional VALUES list has no named-column safety net: every change
  // here needs the matching change to the column list in `store`.
  return Prisma.sql`(
    ${projectId}::uuid,
    ${span.traceId},
    ${span.spanId},
    ${span.parentSpanId},
    ${span.name},
    ${span.kind},
    ${span.statusCode},
    ${span.statusMessage},
    ${span.startedAt},
    ${span.startTimeUnixNano}::bigint,
    ${span.durationNanoseconds}::bigint,
    ${span.serviceName},
    ${span.environment},
    ${span.release},
    ${span.scopeName},
    ${span.scopeVersion},
    ${attributes}::jsonb,
    ${resourceAttributes}::jsonb
  )`;
}

@Injectable()
export class SpanRepository {
  constructor(private readonly database: PrismaService) {}

  /**
   * Store a batch of spans, ignoring any already held.
   *
   * @remarks
   * `DO NOTHING` rather than the log table's `DO UPDATE`: a span is exported
   * once, when it ends, so a retried export carries identical data and the first
   * write is as good as the last. It also means a late duplicate cannot mutate a
   * trace somebody is reading. Nothing is returned because OTLP's response has
   * no room for per-span receipts.
   */
  async store(projectId: string, spans: readonly SpanRow[]): Promise<number> {
    if (spans.length === 0) return 0;

    const values = spans.map((span) => spanValues(projectId, span));
    return this.database.$executeRaw(Prisma.sql`
      INSERT INTO "Span" (
        "projectId",
        "traceId",
        "spanId",
        "parentSpanId",
        "name",
        "kind",
        "statusCode",
        "statusMessage",
        "startedAt",
        "startTimeUnixNano",
        "durationNanoseconds",
        "serviceName",
        "environment",
        "release",
        "scopeName",
        "scopeVersion",
        "attributes",
        "resourceAttributes"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("projectId", "traceId", "spanId") DO NOTHING
    `);
  }

  /**
   * The newest traces, read as their root spans.
   *
   * @remarks
   * A trace is listed by its root rather than by grouping every span, because
   * `(projectId, parentSpanId, startedAt DESC)` answers "the newest roots" from
   * the index alone. Grouping the whole table to find the same 50 rows would
   * read every span the project has ever stored.
   *
   * A trace whose root was never reported does not appear. That is the honest
   * answer for a listing: without a root there is no name, no service, and no
   * duration to show it under.
   */
  async listRootSpans(
    organizationId: string,
    projectId: string,
    limit: number,
  ): Promise<TraceRootRow[]> {
    return this.database.span.findMany({
      where: {
        projectId,
        project: { organizationId },
        parentSpanId: null,
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        traceId: true,
        spanId: true,
        name: true,
        kind: true,
        statusCode: true,
        serviceName: true,
        environment: true,
        startedAt: true,
        durationNanoseconds: true,
      },
    });
  }

  /**
   * Total and failing span counts for the listed traces, in one round trip.
   *
   * @remarks
   * Raw rather than a Prisma `groupBy`, because PostgreSQL's aggregate FILTER
   * counts both figures in a single pass and hands back one row per trace. The
   * Prisma equivalent groups by status as well, leaving the caller to fold rows
   * back together for no gain.
   */
  async countSpansByTrace(
    projectId: string,
    traceIds: readonly string[],
  ): Promise<TraceCountRow[]> {
    if (traceIds.length === 0) return [];

    return this.database.$queryRaw<TraceCountRow[]>(Prisma.sql`
      SELECT
        "traceId",
        count(*)::int AS "total",
        count(*) FILTER (WHERE "statusCode" = 'error')::int AS "errors"
      FROM "Span"
      WHERE "projectId" = ${projectId}::uuid
        AND "traceId" IN (${Prisma.join(traceIds)})
      GROUP BY "traceId"
    `);
  }

  async listSpansForTrace(
    organizationId: string,
    projectId: string,
    traceId: string,
    limit: number,
  ): Promise<SpanDetailRow[]> {
    return this.database.span.findMany({
      where: {
        projectId,
        project: { organizationId },
        traceId,
      },
      orderBy: { startedAt: "asc" },
      take: limit,
      select: {
        id: true,
        spanId: true,
        parentSpanId: true,
        name: true,
        kind: true,
        statusCode: true,
        statusMessage: true,
        serviceName: true,
        scopeName: true,
        scopeVersion: true,
        startedAt: true,
        startTimeUnixNano: true,
        durationNanoseconds: true,
        attributes: true,
        resourceAttributes: true,
      },
    });
  }

  async deleteReceivedBefore(cutoff: Date): Promise<number> {
    const result = await this.database.span.deleteMany({
      where: {
        receivedAt: {
          lt: cutoff,
        },
      },
    });
    return result.count;
  }
}
