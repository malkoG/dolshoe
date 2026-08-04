import type {
  FinishedSpan,
  JsonValue,
  ReporterInfo,
  RuntimeInfo,
  ServiceInfo,
  SpanKind,
  SpanStatusCode,
} from "./types.js";

/**
 * Finished spans, as an OTLP/HTTP JSON export request.
 *
 * @remarks
 * The mirror image of the API's `otlp-spans.ts`, which is what makes the round
 * trip easy to assert: what this writes, that reads. Kept apart from the
 * transport so it can be tested without a network.
 */

const SPAN_KIND_NUMBERS: Record<SpanKind, number> = {
  internal: 1,
  server: 2,
  client: 3,
  producer: 4,
  consumer: 5,
};

const STATUS_CODE_NUMBERS: Record<SpanStatusCode, number> = {
  unset: 0,
  ok: 1,
  error: 2,
};

interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string;
  doubleValue?: number;
  arrayValue?: { values: OtlpAnyValue[] };
  kvlistValue?: { values: OtlpKeyValue[] };
}

interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpExportTraceRequest {
  resourceSpans: Array<{
    resource: { attributes: OtlpKeyValue[] };
    scopeSpans: Array<{
      scope: { name: string; version?: string };
      spans: Array<{
        traceId: string;
        spanId: string;
        parentSpanId?: string;
        name: string;
        kind: number;
        startTimeUnixNano: string;
        endTimeUnixNano: string;
        attributes: OtlpKeyValue[];
        status: { code: number; message?: string };
      }>;
    }>;
  }>;
}

function toAnyValue(value: JsonValue): OtlpAnyValue {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    // An integer goes as intValue, and as a string, because that is what proto3
    // JSON says an int64 is. A fractional number is a double either way.
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (value === null) return { stringValue: "" };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toAnyValue) } };
  return { kvlistValue: { values: toKeyValues(value) } };
}

function toKeyValues(attributes: Readonly<Record<string, JsonValue>>): OtlpKeyValue[] {
  return Object.entries(attributes).map(([key, value]) => ({ key, value: toAnyValue(value) }));
}

function withoutUndefined(
  attributes: Readonly<Record<string, string | undefined>>,
): OtlpKeyValue[] {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] != null)
    .map(([key, value]) => ({ key, value: { stringValue: value } }));
}

export interface ReporterIdentity {
  service: ServiceInfo;
  reporter: ReporterInfo;
  runtime: RuntimeInfo;
}

export function toOtlpTraceRequest(
  spans: readonly FinishedSpan[],
  identity: ReporterIdentity,
): OtlpExportTraceRequest {
  const { service, reporter, runtime } = identity;

  return {
    resourceSpans: [
      {
        resource: {
          // The semantic-convention names, so a Dolshoe reporter's spans are
          // indistinguishable from an OpenTelemetry SDK's once stored.
          attributes: withoutUndefined({
            "service.name": service.name,
            "service.version": service.release,
            "deployment.environment.name": service.environment,
            "telemetry.sdk.name": reporter.name,
            "telemetry.sdk.version": reporter.version,
            "telemetry.sdk.language": "javascript",
            "process.runtime.name": runtime.name,
            "process.runtime.version": runtime.version,
          }),
        },
        scopeSpans: [
          {
            scope: {
              name: reporter.name,
              ...(reporter.version == null ? {} : { version: reporter.version }),
            },
            spans: spans.map((span) => ({
              traceId: span.traceId,
              spanId: span.spanId,
              ...(span.parentSpanId == null ? {} : { parentSpanId: span.parentSpanId }),
              name: span.name,
              kind: SPAN_KIND_NUMBERS[span.kind],
              startTimeUnixNano: span.startTimeUnixNano,
              endTimeUnixNano: span.endTimeUnixNano,
              attributes: toKeyValues(span.attributes ?? {}),
              status: {
                code: STATUS_CODE_NUMBERS[span.status.code],
                ...(span.status.message == null ? {} : { message: span.status.message }),
              },
            })),
          },
        ],
      },
    ],
  };
}
