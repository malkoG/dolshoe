import { NormalizedException, SourceLocation, StackFrame } from "./error-report.contract";
import { asBoundedString, asNonNegativeInt, asPositiveInt, isRecord } from "./summarize-exception";

const MAX_EXCEPTION_DEPTH = 16;
const MAX_STACK_FRAMES = 200;
const MAX_EXCEPTION_CHILDREN = 20;

const MAX_TYPE_LENGTH = 512;
const MAX_MESSAGE_LENGTH = 16_384;
const MAX_CODE_LENGTH = 512;
const MAX_STACK_LENGTH = 65_536;
const MAX_FILE_NAME_LENGTH = 2_048;
const MAX_FUNCTION_NAME_LENGTH = 1_024;
const MAX_MODULE_NAME_LENGTH = 1_024;
const MAX_SOURCE_LINE_LENGTH = 4_096;
const MAX_REPRESENTATION_LENGTH = 4_096;

const MAX_CONTEXT_LINES = 5;

const frameOrigins = new Set(["app", "dependency", "runtime"]);

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asSourceLines(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lines = value
    .filter((line): line is string => typeof line === "string")
    .slice(0, MAX_CONTEXT_LINES)
    .map((line) => line.slice(0, MAX_SOURCE_LINE_LENGTH));
  return lines.length === 0 ? undefined : lines;
}

function readSourceLocation(value: unknown): SourceLocation | undefined {
  if (!isRecord(value)) return undefined;

  const location: SourceLocation = {
    fileName: asBoundedString(value.fileName, MAX_FILE_NAME_LENGTH),
    lineNumber: asPositiveInt(value.lineNumber),
    columnNumber: asNonNegativeInt(value.columnNumber),
    functionName: asBoundedString(value.functionName, MAX_FUNCTION_NAME_LENGTH),
  };

  return Object.values(location).every((field) => field === undefined) ? undefined : location;
}

function readFrame(value: unknown): StackFrame | undefined {
  if (!isRecord(value)) return undefined;

  const origin =
    typeof value.origin === "string" && frameOrigins.has(value.origin)
      ? (value.origin as StackFrame["origin"])
      : undefined;

  const frame: StackFrame = {
    functionName: asBoundedString(value.functionName, MAX_FUNCTION_NAME_LENGTH),
    moduleName: asBoundedString(value.moduleName, MAX_MODULE_NAME_LENGTH),
    fileName: asBoundedString(value.fileName, MAX_FILE_NAME_LENGTH),
    lineNumber: asPositiveInt(value.lineNumber),
    columnNumber: asNonNegativeInt(value.columnNumber),
    sourceLine:
      typeof value.sourceLine === "string"
        ? value.sourceLine.slice(0, MAX_SOURCE_LINE_LENGTH)
        : undefined,
    preContext: asSourceLines(value.preContext),
    postContext: asSourceLines(value.postContext),
    inApp: asBoolean(value.inApp),
    origin,
    native: asBoolean(value.native),
    async: asBoolean(value.async),
  };

  return Object.values(frame).every((field) => field === undefined) ? undefined : frame;
}

/**
 * Rebuild a stored exception tree as something the detail contract will accept.
 *
 * @remarks
 * The same reason `summarizeException` gives, one level up: the `exception`
 * column is JSON written by whichever reporter was current when the event
 * arrived, so it may carry fields this version does not know and may be missing
 * fields it expects. The response schema is `.strict()`, so an unknown key would
 * turn a five-year-old report into a 500 at serialization time. Nothing is
 * copied across that is not read and bounded here.
 *
 * The bounds are re-applied rather than trusted, because a report is only
 * validated against them on the way in — and the way in may have been an older
 * contract with looser ones.
 */
export function readStoredException(value: unknown, depth = 0): NormalizedException {
  if (!isRecord(value) || depth > MAX_EXCEPTION_DEPTH) {
    return {};
  }

  const exception: NormalizedException = {};

  const type = asBoundedString(value.type, MAX_TYPE_LENGTH);
  if (type !== undefined) exception.type = type;

  if (typeof value.message === "string") {
    exception.message = value.message.slice(0, MAX_MESSAGE_LENGTH);
  }

  if (typeof value.code === "string") {
    const code = asBoundedString(value.code, MAX_CODE_LENGTH);
    if (code !== undefined) exception.code = code;
  } else if (typeof value.code === "number" && Number.isFinite(value.code)) {
    exception.code = value.code;
  }

  if (typeof value.stacktrace === "string") {
    exception.stacktrace = value.stacktrace.slice(0, MAX_STACK_LENGTH);
  }

  if (Array.isArray(value.frames)) {
    const frames = value.frames
      .slice(0, MAX_STACK_FRAMES)
      .map((frame) => readFrame(frame))
      .filter((frame): frame is StackFrame => frame !== undefined);
    if (frames.length > 0) exception.frames = frames;
  }

  const source = readSourceLocation(value.source);
  if (source !== undefined) exception.source = source;

  if (isRecord(value.value)) {
    const thrownType = asBoundedString(value.value.type, MAX_TYPE_LENGTH);
    if (thrownType !== undefined) {
      exception.value = {
        type: thrownType,
        ...(typeof value.value.representation === "string"
          ? { representation: value.value.representation.slice(0, MAX_REPRESENTATION_LENGTH) }
          : {}),
      };
    }
  }

  if (value.cause !== undefined) {
    exception.cause = readStoredException(value.cause, depth + 1);
  }
  if (value.context !== undefined) {
    exception.context = readStoredException(value.context, depth + 1);
  }
  if (Array.isArray(value.children)) {
    exception.children = value.children
      .slice(0, MAX_EXCEPTION_CHILDREN)
      .map((child) => readStoredException(child, depth + 1));
  }

  return exception;
}
