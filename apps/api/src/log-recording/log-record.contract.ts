import { z } from "zod";

import {
  reporterSchema,
  runtimeSchema,
  serviceSchema,
} from "../error-reporting/error-report.contract";

const MAX_BATCH_SIZE = 100;
const MAX_ATTRIBUTE_BYTES = 65_536;
const MAX_ATTRIBUTE_DEPTH = 8;
const MAX_ATTRIBUTE_ITEMS = 100;

const contractRegistry = z.registry<{ id?: string; description?: string }>();

const nonEmptyText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function addAttributeIssues(
  value: unknown,
  context: z.RefinementCtx,
  path: PropertyKey[],
  depth: number,
): void {
  if (depth > MAX_ATTRIBUTE_DEPTH) {
    context.addIssue({
      code: "custom",
      message: `Attribute nesting cannot exceed ${MAX_ATTRIBUTE_DEPTH} levels.`,
      path,
    });
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  let count = 0;
  for (const [key, child] of entries) {
    count += 1;
    if (count > MAX_ATTRIBUTE_ITEMS) {
      context.addIssue({
        code: "custom",
        message: `An attribute container cannot contain more than ${MAX_ATTRIBUTE_ITEMS} items.`,
        path,
      });
      return;
    }
    addAttributeIssues(child, context, [...path, key], depth + 1);
  }
}

const traceSchema = z
  .object({
    traceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .meta({ description: "Lowercase W3C-compatible 16-byte trace identifier." }),
    spanId: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .optional()
      .meta({ description: "Lowercase W3C-compatible 8-byte span identifier." }),
  })
  .strict();

export const logRecordSchema = z
  .object({
    eventId: z.uuid().meta({
      description: "Client-generated idempotency key for safe retries.",
    }),
    occurredAt: z.iso
      .datetime()
      .refine((value) => value.endsWith("Z"), "occurredAt must be a UTC timestamp ending in Z.")
      .meta({ description: "UTC timestamp at which the record occurred." }),
    level: z
      .enum(["trace", "debug", "info", "warning", "error", "fatal"])
      .meta({ description: "Normalized LogTape-compatible severity." }),
    message: nonEmptyText(16_384).meta({ description: "Rendered human-readable log message." }),
    category: z
      .array(nonEmptyText(200))
      .max(16)
      .default([])
      .meta({ description: "Hierarchical logger category segments." }),
    service: serviceSchema,
    runtime: runtimeSchema,
    reporter: reporterSchema,
    trace: traceSchema.optional(),
    errorReportEventId: z
      .uuid()
      .optional()
      .meta({ description: "Client eventId of a related error report, when one exists." }),
    attributes: z.record(z.string().min(1).max(200), z.json()).optional().meta({
      description: "Bounded structured context with secrets removed by the reporter.",
    }),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.attributes == null) return;

    if (serializedByteLength(record.attributes) > MAX_ATTRIBUTE_BYTES) {
      context.addIssue({
        code: "custom",
        message: `Serialized attributes cannot exceed ${MAX_ATTRIBUTE_BYTES} bytes.`,
        path: ["attributes"],
      });
    }
    addAttributeIssues(record.attributes, context, ["attributes"], 0);
  })
  .register(contractRegistry, {
    id: "LogRecordV1",
    description: "A runtime-neutral structured log record.",
  });

export const logRecordBatchRequestSchema = z
  .object({
    schemaVersion: z.literal(1).meta({
      description: "Payload contract version. Breaking changes require a new version.",
    }),
    records: z.array(logRecordSchema).min(1).max(MAX_BATCH_SIZE),
  })
  .strict()
  .superRefine((batch, context) => {
    const seen = new Set<string>();
    for (const [index, record] of batch.records.entries()) {
      if (seen.has(record.eventId)) {
        context.addIssue({
          code: "custom",
          message: "eventId values must be unique within a batch.",
          path: ["records", index, "eventId"],
        });
      }
      seen.add(record.eventId);
    }
  })
  .register(contractRegistry, {
    id: "LogRecordBatchRequestV1",
    description: "An atomic batch of up to 100 structured log records.",
  });

export const logRecordReceiptSchema = z
  .object({
    eventId: z.uuid(),
    id: z.uuid().meta({ description: "Server-assigned log record identifier." }),
    receivedAt: z.iso.datetime().meta({
      description: "UTC timestamp at which the server first accepted the record.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "LogRecordReceiptV1",
    description: "Idempotent receipt for one log record.",
  });

export const logRecordBatchReceiptSchema = z
  .object({
    records: z.array(logRecordReceiptSchema),
  })
  .strict()
  .register(contractRegistry, {
    id: "LogRecordBatchReceiptV1",
    description: "Ordered receipts for an accepted log record batch.",
  });

export const LOG_RECORD_LIST_LIMIT = 100;

export const logRecordSummarySchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned log record identifier." }),
    eventId: z
      .uuid()
      .meta({ description: "Client-generated idempotency key the reporter supplied." }),
    occurredAt: z.iso
      .datetime()
      .meta({ description: "UTC timestamp at which the record occurred." }),
    receivedAt: z.iso
      .datetime()
      .meta({ description: "UTC timestamp at which the server first accepted the record." }),
    level: z
      .enum(["trace", "debug", "info", "warning", "error", "fatal"])
      .meta({ description: "Normalized LogTape-compatible severity." }),
    message: z.string().meta({ description: "Rendered human-readable log message." }),
    category: z.array(z.string()).meta({ description: "Hierarchical logger category segments." }),
    service: serviceSchema.meta({ description: "Service that emitted the record." }),
    errorReportEventId: z.uuid().nullable().meta({
      description: "Client eventId of a related error report, when the reporter supplied one.",
    }),
    attributes: z
      .record(z.string(), z.json())
      .nullable()
      .meta({ description: "Structured context stored with the record." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "LogRecordSummaryV1",
    description: "Newest-first summary of a persisted log record.",
  });

export const logRecordListResponseSchema = z
  .object({
    records: z
      .array(logRecordSummarySchema)
      .max(LOG_RECORD_LIST_LIMIT)
      .meta({
        description: `Newest-first log records, bounded to ${LOG_RECORD_LIST_LIMIT} entries.`,
      }),
  })
  .strict()
  .register(contractRegistry, {
    id: "LogRecordListResponseV1",
    description: "Bounded, newest-first list of persisted log records.",
  });

/**
 * The project is a path segment now, so severity is all that is left to ask
 * for in the query string.
 */
export const logRecordListQuerySchema = z
  .object({
    level: z.enum(["trace", "debug", "info", "warning", "error", "fatal"]).optional(),
  })
  .strict();

export type LogRecord = z.infer<typeof logRecordSchema>;
export type LogRecordBatchRequest = z.infer<typeof logRecordBatchRequestSchema>;
export type LogRecordReceipt = z.infer<typeof logRecordReceiptSchema>;
export type LogRecordBatchReceipt = z.infer<typeof logRecordBatchReceiptSchema>;
export type LogRecordSummary = z.infer<typeof logRecordSummarySchema>;
export type LogRecordListResponse = z.infer<typeof logRecordListResponseSchema>;
export type LogRecordListQuery = z.infer<typeof logRecordListQuerySchema>;

function adaptJsonSchemaToOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(adaptJsonSchemaToOpenApi);
  if (value === null || typeof value !== "object") return value;

  const adapted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$id") continue;
    if (key === "examples" && Array.isArray(child) && child.length > 0) {
      adapted.example = adaptJsonSchemaToOpenApi(child[0]);
      continue;
    }
    adapted[key] = adaptJsonSchemaToOpenApi(child);
  }
  return adapted;
}

const generatedSchemas = z.toJSONSchema(contractRegistry, {
  target: "openapi-3.0",
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
}).schemas;

export const logRecordOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
