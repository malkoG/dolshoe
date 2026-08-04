import { z } from "zod";

/**
 * The OTLP/HTTP JSON wire format for traces.
 *
 * @remarks
 * Every object here is `.loose()`, which is the deliberate opposite of every
 * other contract in this codebase. The others describe payloads Dolshoe's own
 * reporters produce, so an unknown field is a mistake worth rejecting. This one
 * describes a format OpenTelemetry owns and revises: `flags`, `traceState`,
 * `droppedAttributesCount`, `events`, `links`, and `schemaUrl` are already on the
 * wire and simply are not read yet, and a field added in the next spec release
 * must not start rejecting a whole batch.
 *
 * The schemas check shape and size only. Ids, timestamps, and enums are checked
 * in `otlp-spans.ts` instead, where a bad value costs one span rather than the
 * entire request — which is what OTLP's partial success is for.
 */

/** OTel's BatchSpanProcessor exports 512 spans at a time by default. */
const MAX_SPANS_PER_REQUEST = 1_000;
const MAX_RESOURCE_SPANS = 100;
const MAX_SCOPE_SPANS = 100;
const MAX_ATTRIBUTES = 256;
const MAX_ATTRIBUTE_KEY_LENGTH = 256;
/** Long enough for any id or hex blob an emitter might send in an id field. */
const MAX_ID_LENGTH = 64;

const contractRegistry = z.registry<{ id?: string; description?: string }>();

/**
 * Both encodings of an unsigned proto3 `int64`. The JSON mapping says a 64-bit
 * integer is a string, and OTel's own exporters honour that, but enough emitters
 * send a plain number that rejecting one would be needlessly strict.
 *
 * @remarks
 * Deliberately not `z.int()`, which caps at `Number.MAX_SAFE_INTEGER`. A
 * nanosecond timestamp is around 1.8e18 and so has *already* lost precision by
 * the time it arrives as a JSON number. Refusing the whole batch over that
 * would help nobody; a hundred nanoseconds of drift on a span that ran for
 * milliseconds is not a measurement anyone acts on.
 */
const int64Schema = z.union([
  z.string().regex(/^\d{1,20}$/),
  z.number().nonnegative().refine(Number.isInteger, "Must be a whole number of nanoseconds."),
]);

/** A proto enum, as either its number or its `SPAN_KIND_*`-style name. */
const protoEnumSchema = z.union([z.number().int(), z.string().max(64)]);

/**
 * `AnyValue` and `KeyValue` are mutually recursive on the wire: a list attribute
 * holds values, and a map attribute holds further key-value pairs.
 *
 * @remarks
 * The nested variants stop at `values: unknown[]` rather than recursing, which
 * bounds their breadth here and leaves their interpretation to
 * `flattenAnyValue`, where a depth cap applies and an unreadable value costs one
 * attribute instead of the request. Modelling the recursion in Zod would buy a
 * prettier OpenAPI schema and nothing else.
 */
export const otlpAnyValueSchema = z
  .object({
    stringValue: z.string().optional(),
    boolValue: z.boolean().optional(),
    intValue: z.union([z.string(), z.number()]).optional(),
    doubleValue: z.number().optional(),
    bytesValue: z.string().optional(),
    arrayValue: z
      .object({ values: z.array(z.unknown()).max(MAX_ATTRIBUTES).optional() })
      .loose()
      .optional(),
    kvlistValue: z
      .object({ values: z.array(z.unknown()).max(MAX_ATTRIBUTES).optional() })
      .loose()
      .optional(),
  })
  .loose()
  .register(contractRegistry, {
    id: "OtlpAnyValue",
    description: "An OpenTelemetry attribute value: exactly one variant is set.",
  });

export const otlpKeyValueSchema = z
  .object({
    key: z.string().max(MAX_ATTRIBUTE_KEY_LENGTH),
    value: otlpAnyValueSchema.optional(),
  })
  .loose()
  .register(contractRegistry, {
    id: "OtlpKeyValue",
    description: "One OpenTelemetry attribute.",
  });

const attributesSchema = z.array(otlpKeyValueSchema).max(MAX_ATTRIBUTES).optional();

export const otlpSpanSchema = z
  .object({
    traceId: z.string().max(MAX_ID_LENGTH).meta({
      description: "16-byte trace identifier, hex-encoded per OTLP/JSON.",
    }),
    spanId: z.string().max(MAX_ID_LENGTH).meta({
      description: "8-byte span identifier, hex-encoded per OTLP/JSON.",
    }),
    parentSpanId: z.string().max(MAX_ID_LENGTH).optional().meta({
      description: "Enclosing span. Absent, empty, or all-zero on a trace's root.",
    }),
    name: z.string().meta({ description: "What the span represents." }),
    kind: protoEnumSchema.optional().meta({
      description: "SpanKind, as its number (0-5) or its SPAN_KIND_* name.",
    }),
    startTimeUnixNano: int64Schema.optional().meta({
      description: "Start, in nanoseconds since the Unix epoch.",
    }),
    endTimeUnixNano: int64Schema.optional().meta({
      description: "End, in nanoseconds since the Unix epoch. A span without one has not ended.",
    }),
    attributes: attributesSchema,
    status: z
      .object({
        code: protoEnumSchema.optional(),
        message: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose()
  .register(contractRegistry, {
    id: "OtlpSpan",
    description: "One OpenTelemetry span.",
  });

export const otlpScopeSpansSchema = z
  .object({
    scope: z
      .object({
        name: z.string().optional(),
        version: z.string().optional(),
      })
      .loose()
      .optional(),
    spans: z.array(otlpSpanSchema).max(MAX_SPANS_PER_REQUEST).optional(),
  })
  .loose()
  .register(contractRegistry, {
    id: "OtlpScopeSpans",
    description: "Spans emitted by one instrumentation scope.",
  });

export const otlpResourceSpansSchema = z
  .object({
    resource: z.object({ attributes: attributesSchema }).loose().optional(),
    scopeSpans: z.array(otlpScopeSpansSchema).max(MAX_SCOPE_SPANS).optional(),
  })
  .loose()
  .register(contractRegistry, {
    id: "OtlpResourceSpans",
    description: "Spans emitted by one resource, typically one service instance.",
  });

export const otlpExportTraceServiceRequestSchema = z
  .object({
    resourceSpans: z.array(otlpResourceSpansSchema).max(MAX_RESOURCE_SPANS).optional(),
  })
  .loose()
  .superRefine((request, context) => {
    let spans = 0;
    for (const resourceSpans of request.resourceSpans ?? []) {
      for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
        spans += scopeSpans.spans?.length ?? 0;
      }
    }

    if (spans > MAX_SPANS_PER_REQUEST) {
      context.addIssue({
        code: "custom",
        message: `A request cannot carry more than ${MAX_SPANS_PER_REQUEST} spans.`,
        path: ["resourceSpans"],
      });
    }
  })
  .register(contractRegistry, {
    id: "OtlpExportTraceServiceRequest",
    description: "An OTLP/HTTP JSON trace export request.",
  });

/**
 * OTLP's response. `rejectedSpans` is a proto3 `int64` and therefore a string.
 *
 * @remarks
 * Success is `{ "partialSuccess": {} }`, not an empty body — that is what the
 * spec asks a receiver to return, and what an exporter checks.
 */
export const otlpExportTraceServiceResponseSchema = z
  .object({
    partialSuccess: z
      .object({
        rejectedSpans: z.string().optional(),
        errorMessage: z.string().optional(),
      })
      .strict(),
  })
  .strict()
  .register(contractRegistry, {
    id: "OtlpExportTraceServiceResponse",
    description: "An OTLP/HTTP JSON trace export response.",
  });

export type OtlpAnyValue = z.infer<typeof otlpAnyValueSchema>;
export type OtlpKeyValue = z.infer<typeof otlpKeyValueSchema>;
export type OtlpSpan = z.infer<typeof otlpSpanSchema>;
export type OtlpScopeSpans = z.infer<typeof otlpScopeSpansSchema>;
export type OtlpResourceSpans = z.infer<typeof otlpResourceSpansSchema>;
export type OtlpExportTraceServiceRequest = z.infer<typeof otlpExportTraceServiceRequestSchema>;
export type OtlpExportTraceServiceResponse = z.infer<typeof otlpExportTraceServiceResponseSchema>;

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

export const otlpTraceOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
