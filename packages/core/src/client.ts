import { parseDsn } from "./dsn.js";
import { normalizeException, sanitizeAttributes } from "./normalize.js";
import { HttpLogTransport, HttpTransport } from "./transport.js";
import type {
  CaptureLogOptions,
  CaptureOptions,
  ClientOptions,
  ErrorReport,
  LogLevel,
  LogRecord,
  LogTransport,
  Transport,
} from "./types.js";

const LOG_LEVELS = new Set<LogLevel>(["trace", "debug", "info", "warning", "error", "fatal"]);
const MAX_LOG_BATCH_SIZE = 100;
const MAX_LOG_MESSAGE_LENGTH = 16_384;
const MAX_LOG_CATEGORY_SEGMENTS = 16;
const MAX_LOG_CATEGORY_SEGMENT_LENGTH = 200;

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

function occurredAt(
  value: CaptureOptions["occurredAt"] | CaptureLogOptions["occurredAt"],
  now: () => Date,
): string {
  if (value == null) return now().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? now().toISOString() : date.toISOString();
}

function normalizeCategory(category: readonly string[] | undefined): string[] | undefined {
  if (category == null) return undefined;
  if (category.length > MAX_LOG_CATEGORY_SEGMENTS) {
    throw new Error(`Dolshoe log categories cannot exceed ${MAX_LOG_CATEGORY_SEGMENTS} segments.`);
  }

  const normalized = category.map((segment) => segment.trim());
  if (
    normalized.some(
      (segment) => segment.length === 0 || segment.length > MAX_LOG_CATEGORY_SEGMENT_LENGTH,
    )
  ) {
    throw new Error(
      `Dolshoe log category segments must contain between 1 and ${MAX_LOG_CATEGORY_SEGMENT_LENGTH} characters.`,
    );
  }
  return normalized.length === 0 ? undefined : normalized;
}

export class Client {
  readonly #options: ClientOptions;
  readonly #transport: Transport;
  readonly #logTransport: LogTransport | undefined;
  readonly #pending = new Set<Promise<void>>();
  readonly #logQueue: LogRecord[] = [];
  #logDrainScheduled = false;
  #closed = false;
  #failedSinceFlush = false;

  constructor(options: ClientOptions) {
    if (options.service.name.trim().length === 0) {
      throw new Error("Dolshoe service.name must not be empty.");
    }

    // A DSN supplies defaults; anything given explicitly wins, so an unusual
    // deployment can still point the reporter wherever it needs to.
    const dsn = options.dsn == null ? undefined : parseDsn(options.dsn);
    const endpoint = options.endpoint ?? dsn?.errorReportEndpoint;
    const logEndpoint = options.logEndpoint ?? dsn?.logEndpoint;
    const headers =
      dsn == null ? options.headers : { authorization: `Bearer ${dsn.token}`, ...options.headers };

    if (options.transport == null && endpoint == null) {
      throw new Error("Dolshoe requires either dsn, endpoint, or transport.");
    }

    this.#options = options;
    this.#transport =
      options.transport ??
      new HttpTransport({
        endpoint: endpoint as string | URL,
        ...(headers == null ? {} : { headers }),
        ...(options.fetch == null ? {} : { fetch: options.fetch }),
      });
    this.#logTransport =
      options.logTransport ??
      (logEndpoint == null
        ? undefined
        : new HttpLogTransport({
            endpoint: logEndpoint,
            ...(headers == null ? {} : { headers }),
            ...(options.fetch == null ? {} : { fetch: options.fetch }),
          }));
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

  captureLog(
    level: LogLevel,
    message: string,
    options: CaptureLogOptions = {},
  ): string | undefined {
    if (this.#closed) return undefined;
    if (this.#logTransport == null) {
      throw new Error("Dolshoe captureLog requires logEndpoint or logTransport.");
    }
    if (!LOG_LEVELS.has(level)) {
      throw new Error(`Dolshoe received an unsupported log level: ${String(level)}.`);
    }
    if (message.length === 0) {
      throw new Error("Dolshoe log messages must not be empty.");
    }

    const eventId = (this.#options.generateEventId ?? defaultEventId)();
    const attributes = sanitizeAttributes(options.attributes);
    const category = normalizeCategory(options.category);
    const record: LogRecord = {
      eventId,
      occurredAt: occurredAt(options.occurredAt, this.#options.now ?? (() => new Date())),
      level,
      message: message.slice(0, MAX_LOG_MESSAGE_LENGTH),
      ...(category == null ? {} : { category }),
      service: this.#options.service,
      runtime: this.#options.runtime,
      reporter: this.#options.reporter,
      ...(options.trace == null ? {} : { trace: options.trace }),
      ...(options.errorReportEventId == null
        ? {}
        : { errorReportEventId: options.errorReportEventId }),
      ...(attributes == null ? {} : { attributes }),
    };

    this.#track(
      Promise.resolve().then(async () => {
        const transformed = this.#options.beforeSendLogRecord
          ? await this.#options.beforeSendLogRecord(record)
          : record;
        if (transformed != null) this.#enqueueLog(transformed);
        return undefined;
      }),
      (error) => this.#handleLogTransportError(error, [record]),
    );
    return eventId;
  }

  async flush(timeoutMilliseconds = 2_000): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMilliseconds);

    while (this.#pending.size > 0 || this.#logQueue.length > 0) {
      this.#drainLogQueue();
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
    const logTransportFlushed = (await this.#logTransport?.flush?.()) ?? true;
    const succeeded = transportFlushed && logTransportFlushed && !this.#failedSinceFlush;
    this.#failedSinceFlush = false;
    return succeeded;
  }

  async close(timeoutMilliseconds = 2_000): Promise<boolean> {
    this.#closed = true;
    const flushed = await this.flush(timeoutMilliseconds);
    const transportClosed = (await this.#transport.close?.()) ?? true;
    const logTransportClosed = (await this.#logTransport?.close?.()) ?? true;
    return flushed && transportClosed && logTransportClosed;
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

    this.#track(
      Promise.resolve().then(async () => {
        const transformed = this.#options.beforeSend
          ? await this.#options.beforeSend(report)
          : report;
        if (transformed != null) await this.#transport.send(transformed);
        return undefined;
      }),
      (error) => {
        if (this.#options.onTransportError != null) {
          this.#options.onTransportError({ error, report });
        } else {
          globalThis.console.error("[dolshoe] Failed to send error report.", error);
        }
      },
    );

    return eventId;
  }

  #enqueueLog(record: LogRecord): void {
    this.#logQueue.push(record);
    if (this.#logQueue.length >= MAX_LOG_BATCH_SIZE) {
      this.#drainLogQueue();
      return;
    }
    if (this.#logDrainScheduled) return;

    this.#logDrainScheduled = true;
    queueMicrotask(() => {
      this.#logDrainScheduled = false;
      this.#drainLogQueue();
    });
  }

  #drainLogQueue(): void {
    const logTransport = this.#logTransport;
    if (logTransport == null) return;

    while (this.#logQueue.length > 0) {
      const records = this.#logQueue.splice(0, MAX_LOG_BATCH_SIZE);
      this.#track(
        Promise.resolve().then(() => logTransport.send(records)),
        (error) => this.#handleLogTransportError(error, records),
      );
    }
  }

  #handleLogTransportError(error: unknown, records: readonly LogRecord[]): void {
    if (this.#options.onLogTransportError != null) {
      this.#options.onLogTransportError({ error, records });
    } else {
      globalThis.console.error(`[dolshoe] Failed to send ${records.length} log record(s).`, error);
    }
  }

  #track(task: Promise<void>, onError: (error: unknown) => void): void {
    let tracked: Promise<void>;
    tracked = task
      .catch((error: unknown) => {
        this.#failedSinceFlush = true;
        onError(error);
      })
      .finally(() => {
        this.#pending.delete(tracked);
      });
    this.#pending.add(tracked);
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

export function captureLog(
  level: LogLevel,
  message: string,
  options?: CaptureLogOptions,
): string | undefined {
  return currentClient?.captureLog(level, message, options);
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
