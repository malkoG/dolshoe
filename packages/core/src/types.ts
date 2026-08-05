export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SourceLocation {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  functionName?: string;
}

/**
 * Which world a frame belongs to.
 *
 * @remarks
 * Finer than `inApp`, which is a boolean and so cannot separate the runtime's
 * own standard library from a dependency the application chose. A reader
 * following a failure wants those collapsed differently.
 */
export type FrameOrigin = "app" | "dependency" | "runtime";

export interface StackFrame {
  functionName?: string;
  moduleName?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  sourceLine?: string;
  preContext?: string[];
  postContext?: string[];
  inApp?: boolean;
  origin?: FrameOrigin;
  native?: boolean;
  async?: boolean;
}

/**
 * Reads a source file so a frame can carry the lines around the one that failed.
 *
 * @remarks
 * A seam rather than a direct `node:fs` call because `@dolshoe/core` runs on
 * four runtimes and can import none of their file APIs. Each runtime package
 * installs one; a reporter without one simply reports frames without context.
 * It returns whole-file lines and is expected to cache: one exception can name
 * the same file in fifty frames.
 */
export type SourceReader = (fileName: string) => readonly string[] | undefined;

export interface ThrownValue {
  type: string;
  representation?: string;
}

export interface NormalizedException {
  type?: string;
  message?: string;
  code?: string | number;
  stacktrace?: string;
  frames?: StackFrame[];
  source?: SourceLocation;
  value?: ThrownValue;
  cause?: NormalizedException;
  context?: NormalizedException;
  children?: NormalizedException[];
}

export interface ServiceInfo {
  name: string;
  environment?: string;
  release?: string;
}

export interface RuntimeInfo {
  name: string;
  version?: string;
}

export interface ReporterInfo {
  name: string;
  version?: string;
}

export interface CaptureMechanism {
  type: string;
  handled?: boolean;
}

export interface TraceContext {
  traceId: string;
  spanId?: string;
}

/** OpenTelemetry's span kinds, minus its unspecified placeholder. */
export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
export type SpanStatusCode = "unset" | "ok" | "error";

/** Where a span sits in its trace. Usable directly as `CaptureOptions.trace`. */
export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Readonly<Record<string, unknown>>;
  /**
   * What to nest under. Defaults to whichever span is active; pass `null` to
   * start a new trace regardless.
   */
  parent?: SpanContext | null;
  startTime?: Date | number;
}

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly context: SpanContext;
  setAttributes(attributes: Readonly<Record<string, unknown>>): void;
  setStatus(code: SpanStatusCode, message?: string): void;
  /** Reports the error against this span, and marks the span failed. */
  recordException(exception: unknown): void;
  /** Ending twice is a no-op: the first end is the one that counts. */
  end(endTime?: Date | number): void;
}

/** A span that has ended and is on its way to the transport. */
export interface FinishedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  /** Decimal nanoseconds since the epoch: past what a number can hold exactly. */
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  status: { code: SpanStatusCode; message?: string };
  attributes?: Record<string, JsonValue>;
}

export interface SpanTransport {
  send(spans: readonly FinishedSpan[]): Promise<void>;
  flush?(): Promise<boolean>;
  close?(): Promise<boolean>;
}

export interface SpanTransportErrorContext {
  error: unknown;
  spans: readonly FinishedSpan[];
}

/**
 * Where the active span lives.
 *
 * @remarks
 * Core cannot reach for `node:async_hooks` — it runs on Deno, Bun, and
 * eventually a browser — so it defines the seam and each runtime package fills
 * it in. This is the same arrangement LogTape uses for its implicit contexts,
 * where the application hands `configure()` an `AsyncLocalStorage`.
 */
export interface SpanScope {
  active(): Span | undefined;
  run<T>(span: Span, callback: () => T): T;
}

export interface ErrorReport {
  schemaVersion: 1;
  eventId: string;
  occurredAt: string;
  service: ServiceInfo;
  runtime: RuntimeInfo;
  reporter: ReporterInfo;
  mechanism?: CaptureMechanism;
  exception: NormalizedException;
  trace?: TraceContext;
  attributes?: Record<string, JsonValue>;
}

export type LogLevel = "trace" | "debug" | "info" | "warning" | "error" | "fatal";

export interface LogRecord {
  eventId: string;
  occurredAt: string;
  level: LogLevel;
  message: string;
  category?: string[];
  service: ServiceInfo;
  runtime: RuntimeInfo;
  reporter: ReporterInfo;
  trace?: TraceContext;
  errorReportEventId?: string;
  attributes?: Record<string, JsonValue>;
}

export interface LogRecordBatch {
  schemaVersion: 1;
  records: LogRecord[];
}

export interface CaptureOptions {
  attributes?: Readonly<Record<string, unknown>>;
  mechanism?: CaptureMechanism;
  trace?: TraceContext;
  occurredAt?: Date | number | string;
}

export interface CaptureLogOptions {
  attributes?: Readonly<Record<string, unknown>>;
  category?: readonly string[];
  trace?: TraceContext;
  errorReportEventId?: string;
  occurredAt?: Date | number | string;
}

export interface Transport {
  send(report: ErrorReport): Promise<void>;
  flush?(): Promise<boolean>;
  close?(): Promise<boolean>;
}

export interface LogTransport {
  send(records: readonly LogRecord[]): Promise<void>;
  flush?(): Promise<boolean>;
  close?(): Promise<boolean>;
}

export interface TransportErrorContext {
  error: unknown;
  report: ErrorReport;
}

export interface LogTransportErrorContext {
  error: unknown;
  records: readonly LogRecord[];
}

export interface ClientOptions {
  /**
   * `https://<token>@<host>/<projectId>`, copied from a project's token screen.
   * Supplies both endpoints and the ingestion credential. An explicit `endpoint`,
   * `logEndpoint`, or `authorization` header overrides what it derives.
   */
  dsn?: string;
  endpoint?: string | URL;
  logEndpoint?: string | URL;
  spanEndpoint?: string | URL;
  service: ServiceInfo;
  runtime: RuntimeInfo;
  reporter: ReporterInfo;
  headers?: Readonly<Record<string, string>>;
  transport?: Transport;
  logTransport?: LogTransport;
  spanTransport?: SpanTransport;
  /**
   * Where the active span is kept. Defaults to a synchronous store, which is
   * correct for straight-line code; the runtime packages supply one backed by
   * `AsyncLocalStorage` so concurrent work cannot steal each other's parent.
   */
  spanScope?: SpanScope;
  fetch?: typeof globalThis.fetch;
  beforeSend?: (report: ErrorReport) => ErrorReport | null | Promise<ErrorReport | null>;
  beforeSendLogRecord?: (record: LogRecord) => LogRecord | null | Promise<LogRecord | null>;
  beforeSendSpan?: (span: FinishedSpan) => FinishedSpan | null | Promise<FinishedSpan | null>;
  onTransportError?: (context: TransportErrorContext) => void;
  onLogTransportError?: (context: LogTransportErrorContext) => void;
  onSpanTransportError?: (context: SpanTransportErrorContext) => void;
  generateEventId?: () => string;
  now?: () => Date;
}

export interface RuntimeInitOptions extends Omit<ClientOptions, "runtime" | "reporter"> {
  captureUnhandledErrors?: boolean;
  /**
   * How many frames the runtime keeps on an `Error`, written to the global
   * `Error.stackTraceLimit` and restored by `close()`. Defaults to 200, matching
   * what the normalizer and the ingestion contract already allow; the runtime's
   * own default of 10 is otherwise where every JavaScript stack stops. Pass
   * `false` to leave the global alone.
   */
  stackFrameLimit?: number | false;
  /**
   * Whether frames in the application's own code carry the source lines around
   * the one that failed. On by default. Reading is synchronous, cached, bounded
   * to application frames, and silent about every failure; pass `false` where
   * the deployed source is not the reported source anyway — a minified bundle,
   * an image that ships without its sources — and the lines would only mislead.
   */
  sourceContext?: boolean;
}

export interface ReporterNamespace {
  captureException(exception: unknown, options?: CaptureOptions): string | undefined;
  captureMessage(message: string, options?: CaptureOptions): string | undefined;
  captureLog(level: LogLevel, message: string, options?: CaptureLogOptions): string | undefined;
  startSpan(name: string, options?: SpanOptions): Span | undefined;
  withSpan<T>(name: string, run: (span: Span | undefined) => T, options?: SpanOptions): T;
  activeSpan(): Span | undefined;
  flush(timeoutMilliseconds?: number): Promise<boolean>;
  close(timeoutMilliseconds?: number): Promise<boolean>;
}
