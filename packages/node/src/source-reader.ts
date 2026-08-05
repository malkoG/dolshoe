import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { SourceReader } from "@dolshoe/core";

/**
 * How many files' contents are kept.
 *
 * @remarks
 * Bounded because this cache lives for the life of the process in an
 * application that may have thousands of source files, and a leak in the
 * reporter is worse than a missing context line. A miss on an evicted entry
 * re-reads, which is a file already in the operating system's own cache.
 */
const MAX_CACHED_FILES = 200;
/** Roughly a very large source file. Anything past it is generated, not read. */
const MAX_FILE_BYTES = 2_000_000;

/**
 * Read source off disk so frames can carry the lines around the failure.
 *
 * @remarks
 * Synchronous on purpose. Capture usually happens while an exception is
 * unwinding — often in an `uncaughtException` handler, moments before the
 * process ends — and there is no guarantee the event loop turns again. An
 * `await` here is a context line that never arrives.
 *
 * Every failure is silent by design: the file may have been bundled away,
 * deleted since deploy, or be unreadable in a hardened container. None of that
 * should turn a report into a second error.
 */
export function createSourceReader(): SourceReader {
  const cache = new Map<string, readonly string[] | undefined>();

  return (fileName) => {
    if (cache.has(fileName)) {
      // Re-inserted so the eviction below is least-recently-used rather than
      // insertion order, which would keep dropping the hot file.
      const cached = cache.get(fileName);
      cache.delete(fileName);
      cache.set(fileName, cached);
      return cached;
    }

    let lines: readonly string[] | undefined;
    try {
      const path = fileName.startsWith("file://") ? fileURLToPath(fileName) : fileName;
      const contents = readFileSync(path, { encoding: "utf8" });
      lines = contents.length > MAX_FILE_BYTES ? undefined : contents.split(/\r?\n/);
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
