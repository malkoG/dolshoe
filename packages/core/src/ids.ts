/** Trace and span identifiers, and the clock that timestamps them. */

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  if (globalThis.crypto?.getRandomValues != null) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  // The same fallback shape `defaultEventId` uses: a runtime without Web Crypto
  // should still produce ids, even if they are only unique rather than
  // unguessable. Nothing here is a credential.
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** 16 bytes, as the 32 lowercase hex characters W3C and OTLP expect. */
export function newTraceId(): string {
  return toHex(randomBytes(16));
}

/** 8 bytes, as 16 lowercase hex characters. */
export function newSpanId(): string {
  return toHex(randomBytes(8));
}

/**
 * Now, in nanoseconds since the epoch.
 *
 * @remarks
 * `Date.now()` only resolves to the millisecond, which would make every span
 * inside one tick look simultaneous and flatten a waterfall. `performance.now()`
 * carries sub-millisecond resolution, and adding it to `timeOrigin` puts it back
 * on the epoch — so the exact-nanosecond columns on the server hold something
 * worth having.
 */
export function nowUnixNano(): bigint {
  const performanceApi = globalThis.performance;

  if (performanceApi?.timeOrigin != null && typeof performanceApi.now === "function") {
    const microseconds = Math.round((performanceApi.timeOrigin + performanceApi.now()) * 1_000);
    return BigInt(microseconds) * 1_000n;
  }

  return BigInt(Date.now()) * 1_000_000n;
}

/** A caller-supplied instant, in the same units. */
export function toUnixNano(time: Date | number): bigint {
  const milliseconds = time instanceof Date ? time.getTime() : time;
  if (!Number.isFinite(milliseconds)) return nowUnixNano();
  return BigInt(Math.round(milliseconds)) * 1_000_000n;
}
