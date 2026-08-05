import type { SourceReader } from "@dolshoe/core";

const MAX_CACHED_FILES = 200;
const MAX_FILE_BYTES = 2_000_000;

interface DenoGlobal {
  readTextFileSync?: (path: string | URL) => string;
}

/**
 * Read source off disk so frames can carry the lines around the failure.
 *
 * @remarks
 * The Deno counterpart of the Node reader, and the reason the seam exists at
 * all: there is no shared file API to write once. Two differences worth naming.
 * Deno frames name modules by URL, and `readTextFileSync` takes one directly,
 * so no path conversion is needed. And a Deno process without `--allow-read`
 * throws `PermissionDenied` here — caught like any other failure, so a locked
 * down process reports frames without context rather than prompting for a
 * permission it was deliberately not given.
 */
export function createSourceReader(): SourceReader {
  const cache = new Map<string, readonly string[] | undefined>();
  const deno = (globalThis as typeof globalThis & { Deno?: DenoGlobal }).Deno;
  const readTextFileSync = deno?.readTextFileSync;

  if (readTextFileSync == null) return () => undefined;

  return (fileName) => {
    if (cache.has(fileName)) {
      const cached = cache.get(fileName);
      cache.delete(fileName);
      cache.set(fileName, cached);
      return cached;
    }

    let lines: readonly string[] | undefined;
    try {
      // Only a local module has readable source; a remote one was fetched into
      // a cache whose layout is not this package's business.
      //
      // A `file://` specifier is handed over as a `URL`, not as the string it
      // came in as: `readTextFileSync` treats a string as a filesystem path, so
      // `"file:///srv/app.ts"` would be looked up as a relative directory
      // called `file:` and never resolve.
      const target = fileName.startsWith("file://")
        ? new URL(fileName)
        : fileName.startsWith("/")
          ? fileName
          : undefined;

      if (target !== undefined) {
        const contents = readTextFileSync.call(deno, target);
        lines = contents.length > MAX_FILE_BYTES ? undefined : contents.split(/\r?\n/);
      }
    } catch {
      lines = undefined;
    }

    if (cache.size >= MAX_CACHED_FILES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(fileName, lines);
    return lines;
  };
}
