import type { SourceReader, StackFrame } from "./types.js";

/** Matches the ingestion contract's own bound. */
export const MAX_CONTEXT_LINES = 5;
const MAX_LINE_LENGTH = 4_096;

let currentReader: SourceReader | undefined;

/**
 * Install the reader used to attach source context to frames.
 *
 * @remarks
 * Global for the same reason `setCurrentClient` is: `normalizeException` is a
 * free function an application can call directly, and threading a reader
 * through every call site to serve one process-wide answer would be noise.
 * Passing `undefined` removes it, which is what `close()` does.
 */
export function setSourceReader(reader: SourceReader | undefined): void {
  currentReader = reader;
}

function clip(line: string): string {
  return line.length <= MAX_LINE_LENGTH ? line : line.slice(0, MAX_LINE_LENGTH);
}

/**
 * Fill `sourceLine`, `preContext` and `postContext` on the frames that warrant it.
 *
 * @remarks
 * Only application frames are read. A dependency's source is on disk too, but a
 * failure in `node_modules` is almost never diagnosed by reading the library's
 * own lines, and reading them would multiply both the file I/O at capture time
 * and the size of every stored report for context nobody opens.
 *
 * Mutates in place: it runs over frames this module's parser has just produced
 * and nobody else holds yet, and copying two hundred frames to add a field to
 * some of them is work with no reader.
 */
export function attachSourceContext(frames: StackFrame[], reader = currentReader): void {
  if (reader == null) return;

  for (const frame of frames) {
    if (frame.origin !== "app" || frame.fileName == null || frame.lineNumber == null) continue;

    const lines = reader(frame.fileName);
    if (lines == null) continue;

    // `lineNumber` is one-based, as every runtime and the contract agree.
    const index = frame.lineNumber - 1;
    if (index < 0 || index >= lines.length) continue;

    const own = lines[index];
    if (own != null) frame.sourceLine = clip(own);

    const before = lines.slice(Math.max(0, index - MAX_CONTEXT_LINES), index);
    if (before.length > 0) frame.preContext = before.map((line) => clip(line));

    const after = lines.slice(index + 1, index + 1 + MAX_CONTEXT_LINES);
    if (after.length > 0) frame.postContext = after.map((line) => clip(line));
  }
}
