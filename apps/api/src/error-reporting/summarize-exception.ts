import { ErrorReportExceptionSummary, SourceLocation } from "./error-report.contract";

const MAX_TYPE_LENGTH = 512;
const MAX_MESSAGE_LENGTH = 16_384;
const MAX_FILE_NAME_LENGTH = 2_048;
const MAX_FUNCTION_NAME_LENGTH = 1_024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBoundedString(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, maximumLength);
}

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function asNonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function deriveSourceLocation(candidate: unknown): SourceLocation | undefined {
  if (!isRecord(candidate)) return undefined;

  const fileName = asBoundedString(candidate.fileName, MAX_FILE_NAME_LENGTH);
  const lineNumber = asPositiveInt(candidate.lineNumber);
  const columnNumber = asNonNegativeInt(candidate.columnNumber);
  const functionName = asBoundedString(candidate.functionName, MAX_FUNCTION_NAME_LENGTH);

  if (fileName == null && lineNumber == null && columnNumber == null && functionName == null) {
    return undefined;
  }

  return { fileName, lineNumber, columnNumber, functionName };
}

/**
 * Stored exception JSON predates or postdates today's contract, so every field is read
 * defensively here instead of trusted as a valid NormalizedException.
 */
export function summarizeException(exception: unknown): ErrorReportExceptionSummary {
  if (!isRecord(exception)) {
    return {};
  }

  const type = asBoundedString(exception.type, MAX_TYPE_LENGTH);
  const message = asBoundedString(exception.message, MAX_MESSAGE_LENGTH);
  const frames = Array.isArray(exception.frames) ? exception.frames : undefined;
  const source = deriveSourceLocation(exception.source) ?? deriveSourceLocation(frames?.[0]);

  return { type, message, source };
}
