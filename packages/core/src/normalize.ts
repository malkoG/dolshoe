import type { JsonValue, NormalizedException, StackFrame } from "./types.js";

const MAX_DEPTH = 16;
const MAX_CHILDREN = 20;
const MAX_FRAMES = 200;
const MAX_STACK_LENGTH = 65_536;
const MAX_MESSAGE_LENGTH = 16_384;
const MAX_REPRESENTATION_LENGTH = 4_096;
const MAX_ATTRIBUTE_DEPTH = 8;
const MAX_ATTRIBUTE_ITEMS = 100;

const sensitiveKeyPattern =
  /(?:authorization|cookie|dsn|pass(?:word|wd)?|secret|token|api[-_]?key|access[-_]?(?:key|token))/i;

function truncate(value: string, maximumLength: number): string {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, Math.max(0, maximumLength - 1))}…`;
}

function readProperty(value: object, property: PropertyKey): unknown {
  try {
    return Reflect.get(value, property);
  } catch {
    return undefined;
  }
}

function isErrorLike(value: unknown): value is Error {
  if (value instanceof Error) {
    return true;
  }

  if (value == null || typeof value !== "object") {
    return false;
  }

  const tag = Object.prototype.toString.call(value);
  return tag.endsWith("Error]");
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function safeRepresentation(value: unknown): string {
  if (typeof value === "string") return truncate(value, MAX_REPRESENTATION_LENGTH);

  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(value, (_key, child: unknown) => {
      if (typeof child === "bigint") return `${child.toString()}n`;
      if (typeof child === "symbol" || typeof child === "function") {
        return String(child);
      }
      if (child != null && typeof child === "object") {
        if (seen.has(child)) return "[Circular]";
        seen.add(child);
      }
      return child;
    });
    return truncate(serialized ?? String(value), MAX_REPRESENTATION_LENGTH);
  } catch {
    return truncate(String(value), MAX_REPRESENTATION_LENGTH);
  }
}

export function parseJavaScriptStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const line of stack.split("\n").slice(1)) {
    const atMatch = /^\s*at\s+(?:(async)\s+)?(.+)$/.exec(line);
    if (!atMatch) continue;

    const isAsync = atMatch[1] === "async";
    let body = atMatch[2] ?? "";
    let functionName: string | undefined;

    if (body.endsWith(")")) {
      const openingParenthesis = body.lastIndexOf(" (");
      if (openingParenthesis >= 0) {
        functionName = body.slice(0, openingParenthesis);
        body = body.slice(openingParenthesis + 2, -1);
      }
    }

    if (body === "native") {
      frames.push({
        ...(functionName == null ? {} : { functionName }),
        native: true,
        ...(isAsync ? { async: true } : {}),
      });
      continue;
    }

    const locationMatch = /^(.*):(\d+):(\d+)$/.exec(body);
    if (!locationMatch) continue;

    const fileName = locationMatch[1];
    const lineNumber = Number(locationMatch[2]);
    const columnNumber = Number(locationMatch[3]);
    if (fileName == null || fileName.length === 0) continue;

    frames.push({
      ...(functionName == null ? {} : { functionName }),
      fileName,
      lineNumber,
      columnNumber,
      inApp:
        !fileName.startsWith("node:") &&
        !fileName.includes("/node_modules/") &&
        !fileName.includes("\\node_modules\\"),
      ...(isAsync ? { async: true } : {}),
    });

    if (frames.length >= MAX_FRAMES) break;
  }

  return frames;
}

export function normalizeException(
  value: unknown,
  depth = 0,
  ancestors = new WeakSet<object>(),
): NormalizedException {
  if (depth > MAX_DEPTH) {
    return {
      type: "TruncatedException",
      message: `Exception nesting exceeded ${MAX_DEPTH} levels.`,
    };
  }

  if (!isErrorLike(value)) {
    return {
      value: {
        type: valueType(value),
        representation: safeRepresentation(value),
      },
    };
  }

  if (ancestors.has(value)) {
    return {
      type: value.name || "Error",
      message: "[Circular exception reference]",
    };
  }

  ancestors.add(value);

  const name = readProperty(value, "name");
  const message = readProperty(value, "message");
  const stack = readProperty(value, "stack");
  const code = readProperty(value, "code");
  const cause = readProperty(value, "cause");
  const errors = readProperty(value, "errors");
  const normalized: NormalizedException = {
    type: typeof name === "string" && name.length > 0 ? truncate(name, 512) : "Error",
  };

  if (typeof message === "string") {
    normalized.message = truncate(message, MAX_MESSAGE_LENGTH);
  }
  if (typeof code === "string") {
    normalized.code = truncate(code, 512);
  } else if (typeof code === "number" && Number.isFinite(code)) {
    normalized.code = code;
  }
  if (typeof stack === "string") {
    normalized.stacktrace = truncate(stack, MAX_STACK_LENGTH);
    const frames = parseJavaScriptStack(stack);
    if (frames.length > 0) normalized.frames = frames;
  }
  if (cause !== undefined) {
    normalized.cause = normalizeException(cause, depth + 1, ancestors);
  }
  if (Array.isArray(errors)) {
    normalized.children = errors
      .slice(0, MAX_CHILDREN)
      .map((child) => normalizeException(child, depth + 1, ancestors));
  }

  ancestors.delete(value);
  return normalized;
}

function sanitizeJsonValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): JsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return typeof value === "string" ? truncate(value, MAX_REPRESENTATION_LENGTH) : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    return safeRepresentation(value);
  }
  if (value === undefined) return undefined;
  if (depth >= MAX_ATTRIBUTE_DEPTH) return "[Truncated]";
  if (isErrorLike(value)) {
    return {
      type: value.name,
      message: truncate(value.message, MAX_REPRESENTATION_LENGTH),
    };
  }
  if (typeof value !== "object") return safeRepresentation(value);
  if (seen.has(value)) return "[Circular]";

  seen.add(value);
  if (Array.isArray(value)) {
    const result = value
      .slice(0, MAX_ATTRIBUTE_ITEMS)
      .map((child) => sanitizeJsonValue(child, depth + 1, seen) ?? null);
    seen.delete(value);
    return result;
  }

  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_ATTRIBUTE_ITEMS)) {
    if (key.length === 0 || key.length > 200) continue;
    if (sensitiveKeyPattern.test(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitizeJsonValue(child, depth + 1, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  seen.delete(value);
  return result;
}

export function sanitizeAttributes(
  attributes: Readonly<Record<string, unknown>> | undefined,
): Record<string, JsonValue> | undefined {
  if (attributes == null) return undefined;

  const result: Record<string, JsonValue> = {};
  const seen = new WeakSet<object>();
  for (const [key, value] of Object.entries(attributes).slice(0, MAX_ATTRIBUTE_ITEMS)) {
    if (key.length === 0 || key.length > 200 || value === undefined) continue;
    result[key] = sensitiveKeyPattern.test(key)
      ? "[REDACTED]"
      : (sanitizeJsonValue(value, 0, seen) ?? null);
  }

  return Object.keys(result).length === 0 ? undefined : result;
}
