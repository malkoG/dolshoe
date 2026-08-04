import type { LogLevel, ReporterNamespace, TraceContext } from "@dolshoe/core";
import { compareLogLevel, getLogger, type LogRecord, type Sink } from "@logtape/logtape";

export interface DolshoeSinkOptions {
  dolshoe: ReporterNamespace;
  errorPropertyNames?: readonly string[];
  beforeSend?: (record: LogRecord) => LogRecord | null;
}

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/i;

/**
 * Trace context a LogTape record carried in its own properties.
 *
 * @remarks
 * A service that already propagates W3C trace context — through LogTape's
 * implicit contexts, say, with `withContext({ traceId, spanId })` — gets its
 * logs correlated without adopting Dolshoe's span API at all. When it has not,
 * this finds nothing and the client falls back to whichever span is active,
 * which is the path a caller using `withSpan` takes.
 *
 * The ids are removed from the attributes on the way through, because they are
 * about to be stored as columns and duplicating them helps nobody.
 */
function readTraceContext(properties: Readonly<Record<string, unknown>>): TraceContext | undefined {
  const traceId = properties.traceId;
  if (typeof traceId !== "string" || !TRACE_ID_PATTERN.test(traceId)) return undefined;

  const spanId = properties.spanId;
  return typeof spanId === "string" && SPAN_ID_PATTERN.test(spanId)
    ? { traceId: traceId.toLowerCase(), spanId: spanId.toLowerCase() }
    : { traceId: traceId.toLowerCase() };
}

function withoutTraceIds(properties: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { traceId: _traceId, spanId: _spanId, ...rest } = properties;
  return rest;
}

function inspect(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (value instanceof Error) return `${value.name}: ${value.message}`;

  try {
    const seen = new WeakSet<object>();
    return (
      JSON.stringify(value, (_key, child: unknown) => {
        if (typeof child === "bigint") return `${child.toString()}n`;
        if (child != null && typeof child === "object") {
          if (seen.has(child)) return "[Circular]";
          seen.add(child);
        }
        return child;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

function renderMessage(record: LogRecord): string {
  return record.message.map(inspect).join("");
}

function findException(
  properties: Readonly<Record<string, unknown>>,
  propertyNames: readonly string[],
): readonly [name: string, exception: Error] | undefined {
  for (const name of propertyNames) {
    const value = properties[name];
    if (
      value instanceof Error ||
      (value != null &&
        typeof value === "object" &&
        Object.prototype.toString.call(value).endsWith("Error]"))
    ) {
      return [name, value as Error];
    }
  }
  return undefined;
}

export function getDolshoeSink(options: DolshoeSinkOptions): Sink {
  const propertyNames = options.errorPropertyNames ?? ["error", "err"];

  return (record: LogRecord): void => {
    try {
      if (record.category[0] === "logtape" && record.category[1] === "meta") {
        return;
      }

      const transformed = options.beforeSend == null ? record : options.beforeSend(record);
      if (transformed == null) return;

      const message = renderMessage(transformed);
      const exceptionProperty = findException(transformed.properties, propertyNames);
      const trace = readTraceContext(transformed.properties);
      const properties =
        trace == null ? transformed.properties : withoutTraceIds(transformed.properties);

      if (exceptionProperty != null && compareLogLevel(transformed.level, "error") >= 0) {
        const [propertyName, exception] = exceptionProperty;
        const attributes: Record<string, unknown> = {
          ...properties,
          "logtape.category": transformed.category.join("."),
          "logtape.level": transformed.level,
          "logtape.message": message,
        };
        delete attributes[propertyName];
        options.dolshoe.captureException(exception, {
          occurredAt: transformed.timestamp,
          mechanism: {
            type: "logtape",
            handled: true,
          },
          ...(trace == null ? {} : { trace }),
          attributes,
        });
      } else {
        options.dolshoe.captureLog(transformed.level as LogLevel, message, {
          occurredAt: transformed.timestamp,
          category: transformed.category,
          ...(trace == null ? {} : { trace }),
          attributes: properties,
        });
      }
    } catch (error) {
      getLogger(["logtape", "meta", "dolshoe"]).error(
        "Failed to capture a LogTape record with Dolshoe",
        { error },
      );
    }
  };
}
