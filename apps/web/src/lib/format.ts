const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const RELATIVE_TIME_DIVISIONS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 30],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

export function formatRelativeTime(isoTimestamp: string): string {
  let duration = (new Date(isoTimestamp).getTime() - Date.now()) / 1000;

  for (const [unit, amount] of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return relativeTimeFormatter.format(Math.round(duration), unit);
    }
    duration /= amount;
  }

  return relativeTimeFormatter.format(Math.round(duration), "year");
}

export const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function formatShortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * A span duration, in whichever unit makes it readable.
 *
 * @remarks
 * Three significant figures throughout, so a waterfall's rows stay the same
 * width and the eye can compare them down the column. Sub-microsecond spans
 * are real — a cache hit, a synchronous handler — and read as nanoseconds
 * rather than a misleading "0 ms".
 */
export function formatDuration(nanoseconds: number): string {
  if (nanoseconds < 1_000) return `${Math.round(nanoseconds)} ns`;

  const [value, unit] =
    nanoseconds < 1_000_000
      ? [nanoseconds / 1_000, "µs"]
      : nanoseconds < 1_000_000_000
        ? [nanoseconds / 1_000_000, "ms"]
        : [nanoseconds / 1_000_000_000, "s"];

  const decimals = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(decimals)} ${unit}`;
}

/**
 * Up to two initials for an avatar. Falls back to the first character of the
 * whole string when a name is one word, and to "?" when it is somehow empty,
 * because an avatar with nothing in it reads as a rendering bug.
 */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return "?";

  const first = words[0] ?? "";
  const last = words.length > 1 ? (words.at(-1) ?? "") : "";

  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}
