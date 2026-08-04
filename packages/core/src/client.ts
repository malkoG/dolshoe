import { parseDsn } from "./dsn.js";
import { normalizeException, sanitizeAttributes } from "./normalize.js";
import { RecordingSpan, resolveParent } from "./span.js";
import { createSynchronousSpanScope } from "./span-scope.js";
import { HttpLogTransport, HttpTransport, OtlpSpanTransport } from "./transport.js";
import type {
  CaptureLogOptions,
  CaptureOptions,
  ClientOptions,
  ErrorReport,
  FinishedSpan,
  LogLevel,
  LogRecord,
  LogTransport,
  Span,
  SpanOptions,
  SpanScope,
  SpanTransport,
  TraceContext,
  Transport,
} from "./types.js";

const LOG_LEVELS = new Set<LogLevel>(["trace", "debug", "info", "warning", "error", "fatal"]);
const MAX_LOG_BATCH_SIZE = 100;
const MAX_SPAN_BATCH_SIZE = 100;
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
  readonly #spanTransport: SpanTransport | undefined;
  readonly #spanScope: SpanScope;
  readonly #pending = new Set<Promise<void>>();
  readonly #logQueue: LogRecord[] = [];
  readonly #spanQueue: FinishedSpan[] = [];
  #logDrainScheduled = false;
  #spanDrainScheduled = false;
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
    const spanEndpoint = options.spanEndpoint ?? dsn?.spanEndpoint;
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
    this.#spanTransport =
      options.spanTransport ??
      (spanEndpoint == null
        ? undefined
        : new OtlpSpanTransport({
            endpoint: spanEndpoint,
            identity: {
              service: options.service,
              reporter: options.reporter,
              runtime: options.runtime,
            },
            ...(headers == null ? {} : { headers }),
            ...(options.fetch == null ? {} : { fetch: options.fetch }),
          }));
    this.#spanScope = options.spanScope ?? createSynchronousSpanScope();
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
      ...this.#traceOf(options.trace),
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

  /**
   * Begins a span. It is reported when `end()` is called, and not before.
   *
   * @remarks
   * The parent defaults to whatever span is active, which is what makes nesting
   * happen without threading a span through every call. `parent: null` opts out
   * and starts a new trace.
   */
  startSpan(name: string, options: SpanOptions = {}): Span {
    const parent = resolveParent(options, this.#spanScope.active());

    return new RecordingSpan({
      name,
      kind: options.kind ?? "internal",
      parent,
      attributes: options.attributes,
      startTime: options.startTime,
      onEnd: (finished) => this.#enqueueSpanForSending(finished),
      onException: (exception, context) => {
        this.captureException(exception, {
          trace: context,
          mechanism: { type: "span", handled: true },
        });
      },
    });
  }

  /**
   * Runs `run` with `name` as the active span, ending it afterwards.
   *
   * @remarks
   * A thrown or rejected value marks the span failed and is reported, then
   * rethrown — the caller's error handling is unchanged by having been
   * measured. Async work is detected from the returned value rather than by
   * requiring the callback to be async, so both styles nest correctly.
   */
  withSpan<T>(name: string, run: (span: Span) => T, options: SpanOptions = {}): T {
    const span = this.startSpan(name, options);

    const fail = (error: unknown): void => {
      span.recordException(error);
      span.end();
    };

    try {
      const result = this.#spanScope.run(span, () => run(span));
      const thenable = result as unknown as Partial<PromiseLike<unknown>> | null | undefined;

      if (thenable != null && typeof thenable.then === "function") {
        return (result as unknown as PromiseLike<unknown>).then(
          (value) => {
            span.end();
            return value;
          },
          (error: unknown) => {
            fail(error);
            throw error;
          },
        ) as T;
      }

      span.end();
      return result;
    } catch (error) {
      fail(error);
      throw error;
    }
  }

  activeSpan(): Span | undefined {
    return this.#spanScope.active();
  }

  async flush(timeoutMilliseconds = 2_000): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMilliseconds);

    while (this.#pending.size > 0 || this.#logQueue.length > 0 || this.#spanQueue.length > 0) {
      this.#drainLogQueue();
      this.#drainSpanQueue();
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
    const spanTransportFlushed = (await this.#spanTransport?.flush?.()) ?? true;
    const succeeded =
      transportFlushed && logTransportFlushed && spanTransportFlushed && !this.#failedSinceFlush;
    this.#failedSinceFlush = false;
    return succeeded;
  }

  async close(timeoutMilliseconds = 2_000): Promise<boolean> {
    this.#closed = true;
    const flushed = await this.flush(timeoutMilliseconds);
    const transportClosed = (await this.#transport.close?.()) ?? true;
    const logTransportClosed = (await this.#logTransport?.close?.()) ?? true;
    const spanTransportClosed = (await this.#spanTransport?.close?.()) ?? true;
    return flushed && transportClosed && logTransportClosed && spanTransportClosed;
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
      ...this.#traceOf(options.trace),
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

  /**
   * The trace an error or log record should carry.
   *
   * @remarks
   * This is what makes a span first class rather than a fourth signal sitting
   * alongside the others: a log written inside `withSpan` lands on that span
   * without the caller passing anything. An explicit `trace` still wins, so
   * code that was already supplying ids is unaffected.
   */
  #traceOf(explicit: TraceContext | undefined): { trace?: TraceContext } {
    if (explicit != null) return { trace: explicit };

    const active = this.#spanScope.active();
    return active == null ? {} : { trace: active.context };
  }

  #enqueueSpanForSending(span: FinishedSpan): void {
    if (this.#closed) return;
    if (this.#spanTransport == null) return;

    this.#track(
      Promise.resolve().then(async () => {
        const transformed = this.#options.beforeSendSpan
          ? await this.#options.beforeSendSpan(span)
          : span;
        if (transformed != null) this.#enqueueSpan(transformed);
        return undefined;
      }),
      (error) => this.#handleSpanTransportError(error, [span]),
    );
  }

  #enqueueSpan(span: FinishedSpan): void {
    this.#spanQueue.push(span);
    if (this.#spanQueue.length >= MAX_SPAN_BATCH_SIZE) {
      this.#drainSpanQueue();
      return;
    }
    if (this.#spanDrainScheduled) return;

    this.#spanDrainScheduled = true;
    queueMicrotask(() => {
      this.#spanDrainScheduled = false;
      this.#drainSpanQueue();
    });
  }

  #drainSpanQueue(): void {
    const spanTransport = this.#spanTransport;
    if (spanTransport == null) return;

    while (this.#spanQueue.length > 0) {
      const spans = this.#spanQueue.splice(0, MAX_SPAN_BATCH_SIZE);
      this.#track(
        Promise.resolve().then(() => spanTransport.send(spans)),
        (error) => this.#handleSpanTransportError(error, spans),
      );
    }
  }

  #handleSpanTransportError(error: unknown, spans: readonly FinishedSpan[]): void {
    if (this.#options.onSpanTransportError != null) {
      this.#options.onSpanTransportError({ error, spans });
    } else {
      globalThis.console.error(`[dolshoe] Failed to send ${spans.length} span(s).`, error);
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

export function startSpan(name: string, options?: SpanOptions): Span | undefined {
  return currentClient?.startSpan(name, options);
}

/**
 * Runs `run` inside a span, when a client is configured.
 *
 * @remarks
 * Without one, `run` still runs and is handed `undefined`. A reporter that has
 * not been initialised must not stop the application's own work from happening,
 * which is the same reason `captureLog` returns quietly rather than throwing.
 */
export function withSpan<T>(
  name: string,
  run: (span: Span | undefined) => T,
  options?: SpanOptions,
): T {
  const client = currentClient;
  if (client == null) return run(undefined);
  return client.withSpan(name, run, options);
}

export function activeSpan(): Span | undefined {
  return currentClient?.activeSpan();
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
