import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { SpanRow } from "./otlp-spans";

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
