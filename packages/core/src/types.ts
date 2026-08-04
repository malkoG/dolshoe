export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SourceLocation {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  functionName?: string;
}

export interface StackFrame {
  functionName?: string;
  moduleName?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  sourceLine?: string;
  inApp?: boolean;
  native?: boolean;
  async?: boolean;
}

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
