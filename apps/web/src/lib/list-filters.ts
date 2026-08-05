/**
 * Reading a list screen's filters back off its URL.
 *
 * @remarks
 * Every list in the app used to hold its filters in component state, which
 * quietly cost three things: a filtered view could not be sent to a colleague,
 * returning from a report landed on an unfiltered list, and a reload forgot
 * what you were looking at. Putting them in the search string fixes all three
 * at once, and the router already validates search on the way in.
 *
 * Each helper answers with `undefined` for anything it does not recognise, so
 * a hand-edited or stale URL degrades to the unfiltered view rather than to a
 * crash — and `undefined` is also what the router drops from the URL again,
 * which keeps the default state addressable as the bare path.
 */

/** A free-text filter. Blank and whitespace-only are the same as absent. */
export function textParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** One of a fixed set of choices, such as a severity or an environment. */
export function optionParam<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * A toggle that is only ever on or absent.
 *
 * @remarks
 * `true` covers a value the router round-tripped itself; the strings cover a
 * URL somebody typed or a link somebody wrote by hand.
 */
export function flagParam(value: unknown): true | undefined {
  return value === true || value === "true" || value === "1" ? true : undefined;
}
