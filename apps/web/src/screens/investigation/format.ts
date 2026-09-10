/**
 * Short form of a W3C trace id for the header chip and the breadcrumb.
 *
 * @remarks
 * Figma's InvestigationHeader shows `4f2a…9c1e` — first four, ellipsis, last
 * four — not the eight-character prefix `formatShortId` uses on list rows.
 */
export function formatTraceChip(traceId: string): string {
  if (traceId.length <= 8) return traceId;
  return `${traceId.slice(0, 4)}…${traceId.slice(-4)}`;
}

export function formatFingerprintChip(fingerprint: string): string {
  const short = fingerprint.length > 8 ? fingerprint.slice(0, 8) : fingerprint;
  return `fp ${short}`;
}

export function formatTruncatedBanner(shown: number): string {
  return `Showing first ${shown.toLocaleString("en")} spans — trace truncated`;
}

export function formatSpanCountLabel(shown: number, total: number, truncated: boolean): string {
  if (!truncated || shown === total) {
    return `${shown.toLocaleString("en")} ${shown === 1 ? "span" : "spans"}`;
  }

  return `${shown.toLocaleString("en")} of ${total.toLocaleString("en")} spans`;
}
