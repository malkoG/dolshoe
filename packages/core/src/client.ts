import { normalizeException, sanitizeAttributes } from "./normalize.js";
import { HttpTransport } from "./transport.js";
import type { CaptureOptions, ClientOptions, ErrorReport, Transport } from "./types.js";

function defaultEventId(): string {
  if (globalThis.crypto?.randomUUID != null) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function occurredAt(value: CaptureOptions["occurredAt"], now: () => Date): string {
  if (value == null) return now().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? now().toISOString() : date.toISOString();
}

export class Client {
  readonly #options: ClientOptions;
  readonly #transport: Transport;
  readonly #pending = new Set<Promise<void>>();
  #closed = false;
  #failedSinceFlush = false;

  constructor(options: ClientOptions) {
    if (options.service.name.trim().length === 0) {
      throw new Error("Dolshoe service.name must not be empty.");
    }
    if (options.transport == null && options.endpoint == null) {
      throw new Error("Dolshoe requires either endpoint or transport.");
    }

    this.#options = options;
    this.#transport =
      options.transport ??
      new HttpTransport({
        endpoint: options.endpoint as string | URL,
        ...(options.headers == null ? {} : { headers: options.headers }),
        ...(options.fetch == null ? {} : { fetch: options.fetch }),
      });
  }

  captureException(exception: unknown, options: CaptureOptions = {}): string | undefined {
    return this.#capture(normalizeException(exception), options);
  }

  captureMessage(message: string, options: CaptureOptions = {}): string | undefined {
    return this.#capture(
      {
        type: "Message",
        message: message.slice(0, 16_384),
      },
      options,
    );
  }

  async flush(timeoutMilliseconds = 2_000): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMilliseconds);

    while (this.#pending.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;

      const drained = Promise.allSettled(this.#pending).then(() => true);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), remaining);
      });
      const completed = await Promise.race([drained, timedOut]);
      if (timeout != null) clearTimeout(timeout);
      if (!completed) return false;
    }

    const transportFlushed = (await this.#transport.flush?.()) ?? true;
    const succeeded = transportFlushed && !this.#failedSinceFlush;
    this.#failedSinceFlush = false;
    return succeeded;
  }

  async close(timeoutMilliseconds = 2_000): Promise<boolean> {
    this.#closed = true;
    const flushed = await this.flush(timeoutMilliseconds);
    const transportClosed = (await this.#transport.close?.()) ?? true;
    return flushed && transportClosed;
  }

  #capture(exception: ErrorReport["exception"], options: CaptureOptions): string | undefined {
    if (this.#closed) return undefined;

    const eventId = (this.#options.generateEventId ?? defaultEventId)();
    const attributes = sanitizeAttributes(options.attributes);
    const report: ErrorReport = {
      schemaVersion: 1,
      eventId,
      occurredAt: occurredAt(options.occurredAt, this.#options.now ?? (() => new Date())),
      service: this.#options.service,
      runtime: this.#options.runtime,
      reporter: this.#options.reporter,
      ...(options.mechanism == null ? {} : { mechanism: options.mechanism }),
      exception,
      ...(options.trace == null ? {} : { trace: options.trace }),
      ...(attributes == null ? {} : { attributes }),
    };

    let task: Promise<void>;
    task = Promise.resolve()
      .then(async () => {
        const transformed = this.#options.beforeSend
          ? await this.#options.beforeSend(report)
          : report;
        if (transformed != null) await this.#transport.send(transformed);
        return undefined;
      })
      .catch((error: unknown) => {
        this.#failedSinceFlush = true;
        if (this.#options.onTransportError != null) {
          this.#options.onTransportError({ error, report });
        } else {
          globalThis.console.error("[dolshoe] Failed to send error report.", error);
        }
      })
      .finally(() => {
        this.#pending.delete(task);
      });

    this.#pending.add(task);
    return eventId;
  }
}

let currentClient: Client | undefined;

export function setCurrentClient(client: Client | undefined): void {
  currentClient = client;
}

export function getClient(): Client | undefined {
  return currentClient;
}

export function captureException(exception: unknown, options?: CaptureOptions): string | undefined {
  return currentClient?.captureException(exception, options);
}

export function captureMessage(message: string, options?: CaptureOptions): string | undefined {
  return currentClient?.captureMessage(message, options);
}

export async function flush(timeoutMilliseconds?: number): Promise<boolean> {
  return (await currentClient?.flush(timeoutMilliseconds)) ?? true;
}

export async function close(timeoutMilliseconds?: number): Promise<boolean> {
  const client = currentClient;
  if (client == null) return true;
  const result = await client.close(timeoutMilliseconds);
  if (currentClient === client) currentClient = undefined;
  return result;
}
