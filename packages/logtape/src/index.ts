import type { ReporterNamespace } from "@dolshoe/core";
import { compareLogLevel, getLogger, type LogRecord, type Sink } from "@logtape/logtape";

export interface DolshoeSinkOptions {
  dolshoe: ReporterNamespace;
  errorPropertyNames?: readonly string[];
  beforeSend?: (record: LogRecord) => LogRecord | null;
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
      if (
        record.category[0] === "logtape" &&
        record.category[1] === "meta" &&
        record.category[2] === "dolshoe"
      ) {
        return;
      }

      const transformed = options.beforeSend == null ? record : options.beforeSend(record);
      if (transformed == null) return;
      const message = renderMessage(transformed);
      if (compareLogLevel(transformed.level, "error") < 0) {
        options.dolshoe.captureLog(transformed.level, message, {
          occurredAt: transformed.timestamp,
          category: transformed.category,
          attributes: transformed.properties,
        });
        return;
      }

      const exceptionProperty = findException(transformed.properties, propertyNames);
      const attributes: Record<string, unknown> = {
        ...transformed.properties,
        "logtape.category": transformed.category.join("."),
        "logtape.level": transformed.level,
        "logtape.message": message,
      };

      if (exceptionProperty != null) {
        const [propertyName, exception] = exceptionProperty;
        delete attributes[propertyName];
        options.dolshoe.captureException(exception, {
          occurredAt: transformed.timestamp,
          mechanism: {
            type: "logtape",
            handled: true,
          },
          attributes,
        });
      } else {
        options.dolshoe.captureMessage(message, {
          occurredAt: transformed.timestamp,
          mechanism: {
            type: "logtape",
            handled: true,
          },
          attributes,
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
