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
