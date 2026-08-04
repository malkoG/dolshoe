/**
 * Reads one named cookie out of a raw `Cookie` header.
 *
 * @remarks
 * Hand-parsed rather than pulling in `cookie-parser`: two cookies matter to this
 * application, and a dependency plus global middleware to find them would be
 * more moving parts than the ten lines it takes.
 *
 * Splits on `;` and matches the full name, so a cookie such as
 * `dolshoe_session_other` cannot be mistaken for `dolshoe_session`.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header == null) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

/**
 * Normalizes the header as Node presents it. A repeated `Cookie` header arrives
 * as an array, and joining is the only reading that does not silently drop half
 * the cookies.
 */
export function cookieHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join("; ") : value;
}
