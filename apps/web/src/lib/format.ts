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
