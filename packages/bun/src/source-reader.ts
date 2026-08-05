import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { SourceReader } from "@dolshoe/core";

const MAX_CACHED_FILES = 200;
const MAX_FILE_BYTES = 2_000_000;

/**
 * Read source off disk so frames can carry the lines around the failure.
 *
 * @remarks
 * Deliberately the same implementation as the Node package's rather than a
 * Bun-specific one: Bun implements `node:fs` and `node:url`, and `Bun.file()`
 * is asynchronous, which capture cannot wait for. It is a copy rather than a
 * shared module because `@dolshoe/core` is the only package the runtime
 * packages share, and it is the one that cannot import a file API at all.
 */
export function createSourceReader(): SourceReader {
  const cache = new Map<string, readonly string[] | undefined>();

  return (fileName) => {
    if (cache.has(fileName)) {
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
