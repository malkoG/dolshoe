import {
  OtlpAnyValue,
  OtlpExportTraceServiceRequest,
  OtlpKeyValue,
  OtlpSpan,
} from "./otlp-trace.contract";

/**
 * Turning the OTLP wire format into rows.
 *
 * @remarks
 * Nothing here throws. OTLP's partial success exists precisely so a receiver can
 * keep the spans it understood and report a count for the rest; an exporter
 * retries on a 5xx, so failing the request over one unreadable span would have
 * it resent forever.
 */

export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
export type SpanStatusCode = "unset" | "ok" | "error";

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const MAX_NAME_LENGTH = 500;
const MAX_STATUS_MESSAGE_LENGTH = 1_024;
const MAX_STRING_ATTRIBUTE_LENGTH = 8_192;
/** Deep enough for any real attribute, shallow enough that recursion is safe. */
const MAX_ATTRIBUTE_DEPTH = 8;

const HEX_TRACE_ID = /^[0-9a-f]{32}$/i;
const HEX_SPAN_ID = /^[0-9a-f]{16}$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const SPAN_KINDS: Record<number, SpanKind> = {
  0: "internal",
  1: "internal",
  2: "server",
  3: "client",
  4: "producer",
  5: "consumer",
};

const SPAN_KIND_NAMES: Record<string, SpanKind> = {
  SPAN_KIND_UNSPECIFIED: "internal",
  SPAN_KIND_INTERNAL: "internal",
  SPAN_KIND_SERVER: "server",
  SPAN_KIND_CLIENT: "client",
  SPAN_KIND_PRODUCER: "producer",
  SPAN_KIND_CONSUMER: "consumer",
};

const STATUS_CODES: Record<number, SpanStatusCode> = {
  0: "unset",
  1: "ok",
  2: "error",
};

const STATUS_CODE_NAMES: Record<string, SpanStatusCode> = {
  STATUS_CODE_UNSET: "unset",
  STATUS_CODE_OK: "ok",
  STATUS_CODE_ERROR: "error",
};

/** The OpenTelemetry semantic conventions' own fallback for a nameless service. */
const UNKNOWN_SERVICE = "unknown_service";

export interface SpanRow {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  statusCode: SpanStatusCode;
  statusMessage: string | null;
  startedAt: Date;
  startTimeUnixNano: bigint;
  durationNanoseconds: bigint;
  serviceName: string;
  environment: string | null;
  release: string | null;
  scopeName: string | null;
  scopeVersion: string | null;
  attributes: Record<string, JsonValue> | null;
  resourceAttributes: Record<string, JsonValue> | null;
}

export interface FlattenedOtlpSpans {
  spans: SpanRow[];
  rejected: number;
  /** Why the first rejected span was rejected, for OTLP's `errorMessage`. */
  firstRejection?: string;
}

/**
 * OTLP/JSON encodes trace and span ids as hex, departing from the standard
 * Protobuf JSON mapping, which would base64 a `bytes` field. Emitters that
 * missed that departure send base64, so both are read and hex is what gets
 * stored — keeping both encodings would leave one trace unfindable under the
 * other.
 */
function normalizeId(value: string | undefined, bytes: 16 | 8): string | undefined {
  if (value == null || value === "") return undefined;

  const hexPattern = bytes === 16 ? HEX_TRACE_ID : HEX_SPAN_ID;
  if (hexPattern.test(value)) return value.toLowerCase();

  const base64Length = bytes === 16 ? 24 : 12;
  if (value.length === base64Length && BASE64.test(value)) {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === bytes) return decoded.toString("hex");
  }

  return undefined;
}

/** An all-zero id is invalid per the spec, and means "none" in a parent field. */
function isZeroId(value: string): boolean {
  return /^0+$/.test(value);
}

function parseUnixNano(value: string | number | undefined): bigint | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return BigInt(Math.round(value));
  }
  if (!/^\d{1,20}$/.test(value)) return undefined;
  return BigInt(value);
}

function toSpanKind(value: string | number | undefined): SpanKind {
  if (typeof value === "number") return SPAN_KINDS[value] ?? "internal";
  if (typeof value === "string") return SPAN_KIND_NAMES[value] ?? "internal";
  return "internal";
}

function toStatusCode(value: string | number | undefined): SpanStatusCode {
  if (typeof value === "number") return STATUS_CODES[value] ?? "unset";
  if (typeof value === "string") return STATUS_CODE_NAMES[value] ?? "unset";
  return "unset";
}

function isKeyValue(value: unknown): value is OtlpKeyValue {
  return (
    value != null && typeof value === "object" && typeof (value as OtlpKeyValue).key === "string"
  );
}

/**
 * One `AnyValue` as plain JSON. `undefined` means the value carried no readable
 * variant, and the attribute is left out rather than stored as null.
 */
export function flattenAnyValue(value: OtlpAnyValue | undefined, depth = 0): JsonValue | undefined {
  if (value == null || depth > MAX_ATTRIBUTE_DEPTH) return undefined;

  if (value.stringValue != null) return value.stringValue.slice(0, MAX_STRING_ATTRIBUTE_LENGTH);
  if (value.boolValue != null) return value.boolValue;
  if (value.doubleValue != null) return value.doubleValue;
  if (value.intValue != null) {
    // An int64 arrives as a string precisely because it may not survive as a
    // number. Keep it a string when it would not, rather than quietly rounding.
    if (typeof value.intValue === "number") return value.intValue;
    const parsed = Number(value.intValue);
    return Number.isSafeInteger(parsed) ? parsed : value.intValue;
  }
  // Bytes stay base64: they are opaque to Dolshoe, and decoding could only
  // produce a string that is not valid text.
  if (value.bytesValue != null) return value.bytesValue;

  if (value.arrayValue != null) {
    const items: JsonValue[] = [];
    for (const item of value.arrayValue.values ?? []) {
      const flattened = flattenAnyValue(item as OtlpAnyValue, depth + 1);
      if (flattened !== undefined) items.push(flattened);
    }
    return items;
  }

  if (value.kvlistValue != null) {
    const pairs = (value.kvlistValue.values ?? []).filter(isKeyValue);
    return flattenAttributes(pairs, depth + 1);
  }

  return undefined;
}

/** `KeyValue[]` as an object. A repeated key keeps its last value. */
export function flattenAttributes(
  pairs: readonly OtlpKeyValue[] | undefined,
  depth = 0,
): Record<string, JsonValue> {
  const attributes: Record<string, JsonValue> = {};
  for (const pair of pairs ?? []) {
    if (pair.key === "") continue;
    const value = flattenAnyValue(pair.value, depth);
    if (value !== undefined) attributes[pair.key] = value;
  }
  return attributes;
}

function emptyToNull(attributes: Record<string, JsonValue>): Record<string, JsonValue> | null {
  return Object.keys(attributes).length === 0 ? null : attributes;
}

function readString(attributes: Record<string, JsonValue>, key: string): string | undefined {
  const value = attributes[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

interface ResourceIdentity {
  serviceName: string;
  environment: string | null;
  release: string | null;
  attributes: Record<string, JsonValue> | null;
}

function readResourceIdentity(attributes: Record<string, JsonValue>): ResourceIdentity {
  return {
    // Required by the semantic conventions, but a batch relayed through a
    // collector can still arrive without it, and dropping those spans would lose
    // real telemetry over a missing label.
    serviceName: readString(attributes, "service.name") ?? UNKNOWN_SERVICE,
    environment:
      readString(attributes, "deployment.environment.name") ??
      // The name this carried before the semantic conventions renamed it.
      readString(attributes, "deployment.environment") ??
      null,
    release: readString(attributes, "service.version") ?? null,
    attributes: emptyToNull(attributes),
  };
}

interface SpanRejection {
  reason: string;
}

function toSpanRow(
  span: OtlpSpan,
  resource: ResourceIdentity,
  scope: { name: string | null; version: string | null },
): SpanRow | SpanRejection {
  const traceId = normalizeId(span.traceId, 16);
  if (traceId == null || isZeroId(traceId)) {
    return { reason: "A span carried a traceId that is not a 16-byte hex identifier." };
  }

  const spanId = normalizeId(span.spanId, 8);
  if (spanId == null || isZeroId(spanId)) {
    return { reason: "A span carried a spanId that is not an 8-byte hex identifier." };
  }

  // Absent, empty, and all-zero all mean the same thing: this is a trace's root.
  const parentSpanId = normalizeId(span.parentSpanId, 8);
  const parent = parentSpanId == null || isZeroId(parentSpanId) ? null : parentSpanId;

  const startTimeUnixNano = parseUnixNano(span.startTimeUnixNano);
  const endTimeUnixNano = parseUnixNano(span.endTimeUnixNano);
  if (startTimeUnixNano == null || startTimeUnixNano === 0n) {
    return { reason: "A span carried no usable startTimeUnixNano." };
  }
  if (endTimeUnixNano == null || endTimeUnixNano === 0n) {
    // Zero is what an exporter sends for a span that has not ended. Dolshoe
    // stores finished spans, so there is nothing to record yet.
    return { reason: "A span had not ended: its endTimeUnixNano was absent or zero." };
  }
  if (endTimeUnixNano < startTimeUnixNano) {
    return { reason: "A span ended before it started." };
  }

  const attributes = flattenAttributes(span.attributes);
  const statusMessage = span.status?.message;

  return {
    traceId,
    spanId,
    parentSpanId: parent,
    name: span.name.slice(0, MAX_NAME_LENGTH),
    kind: toSpanKind(span.kind),
    statusCode: toStatusCode(span.status?.code),
    statusMessage:
      statusMessage == null || statusMessage === ""
        ? null
        : statusMessage.slice(0, MAX_STATUS_MESSAGE_LENGTH),
    startedAt: new Date(Number(startTimeUnixNano / 1_000_000n)),
    startTimeUnixNano,
    durationNanoseconds: endTimeUnixNano - startTimeUnixNano,
    serviceName: resource.serviceName,
    environment: resource.environment,
    release: resource.release,
    scopeName: scope.name,
    scopeVersion: scope.version,
    attributes: emptyToNull(attributes),
    resourceAttributes: resource.attributes,
  };
}

function isRejection(value: SpanRow | SpanRejection): value is SpanRejection {
  return "reason" in value;
}

/**
 * Every span in an export request, flattened into rows, with a count of the ones
 * that could not be read.
 */
export function flattenOtlpSpans(request: OtlpExportTraceServiceRequest): FlattenedOtlpSpans {
  const spans: SpanRow[] = [];
  let rejected = 0;
  let firstRejection: string | undefined;

  for (const resourceSpans of request.resourceSpans ?? []) {
    const resource = readResourceIdentity(flattenAttributes(resourceSpans.resource?.attributes));

    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      const scope = {
        name: scopeSpans.scope?.name ?? null,
        version: scopeSpans.scope?.version ?? null,
      };

      for (const span of scopeSpans.spans ?? []) {
        const row = toSpanRow(span, resource, scope);
        if (isRejection(row)) {
          rejected += 1;
          firstRejection ??= row.reason;
          continue;
        }
        spans.push(row);
      }
    }
  }

  return firstRejection == null ? { spans, rejected } : { spans, rejected, firstRejection };
}
