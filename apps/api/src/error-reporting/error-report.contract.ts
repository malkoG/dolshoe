import { z } from "zod";

import { projectReferenceSchema } from "../projects/project.contract";

const MAX_EXCEPTION_DEPTH = 16;
const MAX_STACK_FRAMES = 200;
const MAX_EXCEPTION_CHILDREN = 20;
/**
 * Source lines kept either side of a frame's own line.
 *
 * @remarks
 * Five is enough to see the block a failure sits in without turning a two
 * hundred frame report into a file listing: 200 frames × 11 lines is already a
 * megabyte of context before anything else in the payload.
 */
const MAX_CONTEXT_LINES = 5;

const contractRegistry = z.registry<{ id?: string; description?: string }>();

const nonEmptyText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

export const sourceLocationSchema = z
  .object({
    fileName: nonEmptyText(2_048)
      .optional()
      .meta({ description: "Source file, module URL, or runtime-specific code location." }),
    lineNumber: z
      .int()
      .positive()
      .optional()
      .meta({ description: "One-based source line number, when the runtime provides one." }),
    columnNumber: z.int().nonnegative().optional().meta({
      description:
        "Source column number as reported by the runtime. Consumers must not assume a common base.",
    }),
    functionName: nonEmptyText(1_024)
      .optional()
      .meta({ description: "Function or callable name associated with the location." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "SourceLocationV1",
    description: "A normalized source-code location.",
  });

export const stackFrameSchema = z
  .object({
    functionName: nonEmptyText(1_024)
      .optional()
      .meta({ description: "Function or callable name, if available." }),
    moduleName: nonEmptyText(1_024)
      .optional()
      .meta({ description: "Python module or JavaScript module identifier." }),
    fileName: nonEmptyText(2_048)
      .optional()
      .meta({ description: "Source file path, module URL, or runtime-specific script name." }),
    lineNumber: z
      .int()
      .positive()
      .optional()
      .meta({ description: "One-based source line number, when available." }),
    columnNumber: z.int().nonnegative().optional().meta({
      description:
        "Source column number as reported by the runtime. Its base can differ by runtime.",
    }),
    sourceLine: z
      .string()
      .max(4_096)
      .optional()
      .meta({ description: "Optional source-code line captured by the reporter." }),
    preContext: z.array(z.string().max(4_096)).max(MAX_CONTEXT_LINES).optional().meta({
      description:
        "Source lines immediately above sourceLine, in file order. The last entry is the line directly above the one that failed.",
    }),
    postContext: z.array(z.string().max(4_096)).max(MAX_CONTEXT_LINES).optional().meta({
      description:
        "Source lines immediately below sourceLine, in file order. The first entry is the line directly below the one that failed.",
    }),
    inApp: z
      .boolean()
      .optional()
      .meta({ description: "Whether the reporter considers this frame application-owned code." }),
    origin: z
      .enum(["app", "dependency", "runtime"])
      .optional()
      .meta({
        description:
          "Which world the frame belongs to. Finer than inApp, which cannot separate the runtime's own standard library from a third-party dependency.",
        examples: ["runtime"],
      }),
    native: z.boolean().optional().meta({ description: "Whether this is a native runtime frame." }),
    async: z
      .boolean()
      .optional()
      .meta({ description: "Whether this frame crosses an asynchronous boundary." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "StackFrameV1",
    description: "A runtime-neutral structured stack frame.",
  });

export const thrownValueSchema = z
  .object({
    type: nonEmptyText(256).meta({
      description: "Reporter-observed type of a thrown non-Error value.",
      examples: ["string", "number", "object"],
    }),
    representation: z
      .string()
      .max(4_096)
      .optional()
      .meta({ description: "Safe, bounded textual representation of the thrown value." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ThrownValueV1",
    description: "A normalized representation of a non-exception value that was thrown.",
  });

export interface NormalizedException {
  type?: string;
  message?: string;
  code?: string | number;
  stacktrace?: string;
  frames?: z.infer<typeof stackFrameSchema>[];
  source?: z.infer<typeof sourceLocationSchema>;
  value?: z.infer<typeof thrownValueSchema>;
  cause?: NormalizedException;
  context?: NormalizedException;
  children?: NormalizedException[];
}

export const normalizedExceptionSchema: z.ZodType<NormalizedException> = z
  .lazy(() =>
    z
      .object({
        type: nonEmptyText(512)
          .optional()
          .meta({
            description: "Runtime exception class or constructor name.",
            examples: ["TypeError", "ValueError"],
          }),
        message: z
          .string()
          .max(16_384)
          .optional()
          .meta({ description: "Human-readable exception message." }),
        code: z
          .union([z.string().max(512), z.number().finite()])
          .optional()
          .meta({ description: "Runtime or application error code, when present." }),
        stacktrace: z.string().max(65_536).optional().meta({
          description:
            "Original stack trace text preserved for fidelity and forward compatibility.",
        }),
        frames: z.array(stackFrameSchema).max(MAX_STACK_FRAMES).optional().meta({
          description:
            "Normalized frames ordered exactly as supplied by the reporter; raw stacktrace remains authoritative.",
        }),
        source: sourceLocationSchema
          .optional()
          .meta({ description: "Location directly attached to the exception, if available." }),
        value: thrownValueSchema.optional().meta({
          description:
            "Present when a runtime throws a value that is not a conventional exception.",
        }),
        cause: normalizedExceptionSchema
          .optional()
          .meta({ description: "Explicit cause chain, such as Python __cause__ or Error.cause." }),
        context: normalizedExceptionSchema.optional().meta({
          description: "Implicit Python exception context, when it is distinct from cause.",
        }),
        children: z.array(normalizedExceptionSchema).max(MAX_EXCEPTION_CHILDREN).optional().meta({
          description:
            "Grouped exceptions, such as Python ExceptionGroup members or AggregateError errors.",
        }),
      })
      .strict(),
  )
  .register(contractRegistry, {
    id: "NormalizedExceptionV1",
    description:
      "A recursive, runtime-neutral exception tree that preserves raw text and structured details.",
  });

export const runtimeSchema = z
  .object({
    name: nonEmptyText(100).meta({
      description: "Runtime family. This remains an open string for forward compatibility.",
      examples: ["cpython", "node", "deno", "bun"],
    }),
    version: nonEmptyText(100)
      .optional()
      .meta({ description: "Runtime version reported by the adapter." }),
  })
  .strict();

export const reporterSchema = z
  .object({
    name: nonEmptyText(200).meta({
      description: "Reporter library or adapter name.",
      examples: ["dolshoe-python", "dolshoe-node"],
    }),
    version: nonEmptyText(100)
      .optional()
      .meta({ description: "Reporter library or adapter version." }),
  })
  .strict();

export const serviceSchema = z
  .object({
    name: nonEmptyText(200).meta({
      description: "Stable logical service name.",
      examples: ["checkout-api"],
    }),
    environment: nonEmptyText(100)
      .optional()
      .meta({ description: "Deployment environment, such as production or staging." }),
    release: nonEmptyText(200)
      .optional()
      .meta({ description: "Deploy, build, or source revision identifier." }),
  })
  .strict();

const mechanismSchema = z
  .object({
    type: nonEmptyText(200).meta({
      description: "Capture mechanism used by the reporter.",
      examples: ["uncaughtException", "unhandledRejection", "sys.excepthook"],
    }),
    handled: z
      .boolean()
      .optional()
      .meta({ description: "Whether application code handled the failure." }),
  })
  .strict();

const traceSchema = z
  .object({
    traceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .meta({ description: "Lowercase W3C/OpenTelemetry-compatible 16-byte trace identifier." }),
    spanId: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .optional()
      .meta({ description: "Lowercase W3C/OpenTelemetry-compatible 8-byte span identifier." }),
  })
  .strict();

function addExceptionDepthIssue(
  exception: NormalizedException,
  context: z.RefinementCtx,
  path: PropertyKey[],
  depth: number,
): void {
  if (depth > MAX_EXCEPTION_DEPTH) {
    context.addIssue({
      code: "custom",
      message: `Exception nesting cannot exceed ${MAX_EXCEPTION_DEPTH} levels.`,
      path,
    });
    return;
  }

  if (exception.cause) {
    addExceptionDepthIssue(exception.cause, context, [...path, "cause"], depth + 1);
  }
  if (exception.context) {
    addExceptionDepthIssue(exception.context, context, [...path, "context"], depth + 1);
  }
  for (const [index, child] of (exception.children ?? []).entries()) {
    addExceptionDepthIssue(child, context, [...path, "children", index], depth + 1);
  }
}

export const errorReportRequestSchema = z
  .object({
    schemaVersion: z.literal(1).meta({
      description: "Payload contract version. Breaking changes require a new version.",
      examples: [1],
    }),
    eventId: z.uuid().meta({
      description: "Client-generated idempotency key for safe retries.",
      examples: ["bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7"],
    }),
    occurredAt: z.iso
      .datetime()
      .refine((value) => value.endsWith("Z"), "occurredAt must be a UTC timestamp ending in Z.")
      .meta({
        description: "UTC timestamp at which the failure occurred.",
        examples: ["2026-07-24T08:30:00.000Z"],
      }),
    service: serviceSchema,
    runtime: runtimeSchema,
    reporter: reporterSchema,
    mechanism: mechanismSchema.optional(),
    exception: normalizedExceptionSchema,
    trace: traceSchema.optional(),
    attributes: z.record(z.string().min(1).max(200), z.json()).optional().meta({
      description:
        "Bounded application-specific JSON context. Secrets and personal data must be removed by the reporter.",
    }),
  })
  .strict()
  .superRefine((report, context) => {
    addExceptionDepthIssue(report.exception, context, ["exception"], 0);
  })
  .register(contractRegistry, {
    id: "ErrorReportRequestV1",
    description:
      "Version 1 runtime-neutral error report accepted from Python and JavaScript adapters.",
  });

export const errorReportReceiptSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned error report identifier." }),
    receivedAt: z.iso.datetime().meta({
      description: "UTC timestamp at which the server first accepted the event.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ErrorReportReceiptV1",
    description: "Idempotent ingestion receipt.",
  });

export const ERROR_REPORT_LIST_LIMIT = 50;

export const errorReportExceptionSummarySchema = z
  .object({
    type: nonEmptyText(512)
      .optional()
      .meta({ description: "Runtime exception class or constructor name, when present." }),
    message: z
      .string()
      .max(16_384)
      .optional()
      .meta({ description: "Human-readable exception message, when present." }),
    source: sourceLocationSchema.optional().meta({
      description:
        "Best-effort source location: the exception's own location, or its first stack frame.",
    }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ErrorReportExceptionSummaryV1",
    description:
      "Summary of a stored exception's type, message, and location, derived defensively from persisted JSON.",
  });

export const errorReportSummarySchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned error report identifier." }),
    eventId: z
      .uuid()
      .meta({ description: "Client-generated idempotency key the reporter supplied." }),
    occurredAt: z.iso
      .datetime()
      .meta({ description: "UTC timestamp at which the failure occurred." }),
    receivedAt: z.iso.datetime().meta({
      description: "UTC timestamp at which the server first accepted the event.",
    }),
    project: projectReferenceSchema.meta({
      description: "Project the report was ingested into, determined by the token that sent it.",
    }),
    service: serviceSchema.meta({ description: "Service that reported the failure." }),
    runtime: runtimeSchema.meta({ description: "Runtime that reported the failure." }),
    exception: errorReportExceptionSummarySchema,
  })
  .strict()
  .register(contractRegistry, {
    id: "ErrorReportSummaryV1",
    description: "Newest-first summary of a persisted error report for the web inbox.",
  });

export const errorReportListResponseSchema = z
  .object({
    reports: z
      .array(errorReportSummarySchema)
      .max(ERROR_REPORT_LIST_LIMIT)
      .meta({
        description: `Newest-first error report summaries, bounded to ${ERROR_REPORT_LIST_LIMIT} entries.`,
      }),
  })
  .strict()
  .register(contractRegistry, {
    id: "ErrorReportListResponseV1",
    description: "Bounded, newest-first list of persisted error report summaries.",
  });

export type ErrorReportRequest = z.infer<typeof errorReportRequestSchema>;
export type ErrorReportReceipt = z.infer<typeof errorReportReceiptSchema>;
export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type ErrorReportExceptionSummary = z.infer<typeof errorReportExceptionSummarySchema>;
export type ErrorReportSummary = z.infer<typeof errorReportSummarySchema>;
export type ErrorReportListResponse = z.infer<typeof errorReportListResponseSchema>;

function adaptJsonSchemaToOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(adaptJsonSchemaToOpenApi);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const adapted: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (key === "$id") {
      continue;
    }

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

export const errorReportOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
