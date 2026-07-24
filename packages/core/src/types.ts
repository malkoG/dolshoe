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

export interface CaptureOptions {
  attributes?: Readonly<Record<string, unknown>>;
  mechanism?: CaptureMechanism;
  trace?: TraceContext;
  occurredAt?: Date | number | string;
}

export interface Transport {
  send(report: ErrorReport): Promise<void>;
  flush?(): Promise<boolean>;
  close?(): Promise<boolean>;
}

export interface TransportErrorContext {
  error: unknown;
  report: ErrorReport;
}

export interface ClientOptions {
  endpoint?: string | URL;
  service: ServiceInfo;
  runtime: RuntimeInfo;
  reporter: ReporterInfo;
  headers?: Readonly<Record<string, string>>;
  transport?: Transport;
  fetch?: typeof globalThis.fetch;
  beforeSend?: (report: ErrorReport) => ErrorReport | null | Promise<ErrorReport | null>;
  onTransportError?: (context: TransportErrorContext) => void;
  generateEventId?: () => string;
  now?: () => Date;
}

export interface RuntimeInitOptions extends Omit<ClientOptions, "runtime" | "reporter"> {
  captureUnhandledErrors?: boolean;
}

export interface ReporterNamespace {
  captureException(exception: unknown, options?: CaptureOptions): string | undefined;
  captureMessage(message: string, options?: CaptureOptions): string | undefined;
  flush(timeoutMilliseconds?: number): Promise<boolean>;
  close(timeoutMilliseconds?: number): Promise<boolean>;
}
