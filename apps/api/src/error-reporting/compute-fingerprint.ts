import { createHash } from "node:crypto";

import { NormalizedException } from "./error-report.contract";
import { summarizeException } from "./summarize-exception";

/**
 * A cheap approximation of "have we seen this before" — not a Sentry-style
 * Issue, just a bucketing key.
 *
 * @remarks
 * Mirrors Sentry's own priority order: a stack location first, the message
 * only as a fallback when no location exists at all. The message is never
 * combined with a location, because it routinely carries dynamic data (an
 * id, a path) that would fragment one recurring bug into many fingerprints.
 * `type` alone, with neither a location nor a message, still gets a stable
 * fingerprint rather than an accidental one built from nothing.
 */
export function computeFingerprint(exception: NormalizedException): string {
  const { type, message, source } = summarizeException(exception);
  const typeKey = type ?? "unknown";

  const basis =
    source?.fileName != null || source?.functionName != null
      ? `${typeKey}|${source.fileName ?? ""}|${source.lineNumber ?? ""}|${source.functionName ?? ""}`
      : `${typeKey}|${message ?? ""}`;

  return createHash("sha256").update(basis).digest("hex");
}
