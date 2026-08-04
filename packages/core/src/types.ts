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
  service: ServiceInfo;
  runtime: RuntimeInfo;
  reporter: ReporterInfo;
  headers?: Readonly<Record<string, string>>;
  transport?: Transport;
  logTransport?: LogTransport;
  fetch?: typeof globalThis.fetch;
  beforeSend?: (report: ErrorReport) => ErrorReport | null | Promise<ErrorReport | null>;
  beforeSendLogRecord?: (record: LogRecord) => LogRecord | null | Promise<LogRecord | null>;
  onTransportError?: (context: TransportErrorContext) => void;
  onLogTransportError?: (context: LogTransportErrorContext) => void;
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
  flush(timeoutMilliseconds?: number): Promise<boolean>;
  close(timeoutMilliseconds?: number): Promise<boolean>;
}
