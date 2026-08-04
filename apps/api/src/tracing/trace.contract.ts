import { z } from "zod";

/**
 * What reading traces back looks like. Strict, described, and versioned, the way
 * every other read contract here is — `otlp-trace.contract.ts` is permissive
 * because OpenTelemetry owns that format, but this one is ours.
 */

const contractRegistry = z.registry<{ id?: string; description?: string }>();

export const TRACE_LIST_LIMIT = 50;
/** Well past any trace worth drawing, and short of one that would freeze a tab. */
export const MAX_TRACE_SPANS = 2_000;

export const traceIdParamSchema = z.string().regex(/^[0-9a-f]{32}$/);

const spanKindSchema = z.enum(["internal", "server", "client", "producer", "consumer"]);
const spanStatusSchema = z.enum(["unset", "ok", "error"]);

/**
 * Nanosecond figures cross the wire as numbers, not the strings a `BigInt`
 * usually needs.
 *
 * @remarks
 * A nanosecond timestamp since the epoch is around 1.8e18 and would lose
 * precision as a JavaScript number, so it never leaves the server: what is sent
 * is an offset from the trace's own start, which is bounded by the trace's
 * duration and therefore exact below 2^53 nanoseconds — a hundred and four days.
 * The browser gets to do arithmetic instead of parsing.
 */
const nanosecondsSchema = z.int().nonnegative();

export const traceSummarySchema = z
  .object({
    traceId: z.string().meta({ description: "Lowercase 16-byte trace identifier." }),
    rootSpanId: z.string().meta({ description: "The span the trace is named after." }),
    name: z.string().meta({ description: "The root span's name." }),
    kind: spanKindSchema.meta({ description: "The root span's kind." }),
    serviceName: z.string().meta({ description: "Service that emitted the root span." }),
    environment: z.string().nullable(),
    startedAt: z.iso.datetime().meta({ description: "When the root span started." }),
    durationNanoseconds: nanosecondsSchema.meta({ description: "The root span's duration." }),
    statusCode: spanStatusSchema.meta({ description: "The root span's status." }),
    spanCount: z.int().nonnegative().meta({ description: "Spans stored for this trace." }),
    errorSpanCount: z.int().nonnegative().meta({
      description: "Spans in this trace whose status is error, at any depth.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "TraceSummaryV1",
    description: "One trace, summarized by its root span.",
  });

export const traceListResponseSchema = z
  .object({
    traces: z
      .array(traceSummarySchema)
      .max(TRACE_LIST_LIMIT)
      .meta({ description: `Newest-first traces, bounded to ${TRACE_LIST_LIMIT} entries.` }),
  })
  .strict()
  .register(contractRegistry, {
    id: "TraceListResponseV1",
    description: "Bounded, newest-first list of traces.",
  });

export const traceSpanSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned span row identifier." }),
    spanId: z.string(),
    parentSpanId: z.string().nullable(),
    depth: z.int().nonnegative().meta({
      description: "Ancestors within this trace. A span whose parent was never reported reads 0.",
    }),
    name: z.string(),
    kind: spanKindSchema,
    statusCode: spanStatusSchema,
    statusMessage: z.string().nullable(),
    serviceName: z.string(),
    scopeName: z.string().nullable(),
    scopeVersion: z.string().nullable(),
    startedAt: z.iso.datetime(),
    startOffsetNanoseconds: nanosecondsSchema.meta({
      description: "Nanoseconds between the trace's start and this span's.",
    }),
    durationNanoseconds: nanosecondsSchema,
    attributes: z.record(z.string(), z.json()).nullable(),
    resourceAttributes: z.record(z.string(), z.json()).nullable(),
  })
  .strict()
  .register(contractRegistry, {
    id: "TraceSpanV1",
    description: "One span of a trace, positioned within it.",
  });

export const traceDetailSchema = z
  .object({
    traceId: z.string(),
    startedAt: z.iso.datetime().meta({ description: "When the earliest span started." }),
    durationNanoseconds: nanosecondsSchema.meta({
      description: "From the earliest span's start to the latest span's end.",
    }),
    spanCount: z.int().nonnegative(),
    truncated: z.boolean().meta({
      description: `True when the trace holds more than ${MAX_TRACE_SPANS} spans and was cut.`,
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "TraceDetailV1",
    description: "A trace as a whole, apart from its spans.",
  });

export const traceDetailResponseSchema = z
  .object({
    trace: traceDetailSchema,
    spans: z.array(traceSpanSchema).max(MAX_TRACE_SPANS).meta({
      description: "Depth-first, parents before children, siblings oldest first.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "TraceDetailResponseV1",
    description: "One trace and every span stored for it.",
  });

export type TraceSummary = z.infer<typeof traceSummarySchema>;
export type TraceListResponse = z.infer<typeof traceListResponseSchema>;
export type TraceSpan = z.infer<typeof traceSpanSchema>;
export type TraceDetail = z.infer<typeof traceDetailSchema>;
export type TraceDetailResponse = z.infer<typeof traceDetailResponseSchema>;

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

export const traceOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
