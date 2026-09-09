export {
  Client,
  activeScope,
  activeSpan,
  addBreadcrumb,
  captureException,
  captureLog,
  captureMessage,
  close,
  flush,
  getClient,
  setCurrentClient,
  setTag,
  setTags,
  setUser,
  startSpan,
  withScope,
  withSpan,
} from "./client.js";
export { parseDsn } from "./dsn.js";
export type { ParsedDsn } from "./dsn.js";
export { newSpanId, newTraceId, nowUnixNano } from "./ids.js";
export {
  normalizeException,
  parseJavaScriptStack,
  sanitizeAttributes,
  sanitizeBreadcrumbs,
  sanitizeTags,
  sanitizeUser,
} from "./normalize.js";
export { toOtlpTraceRequest } from "./otlp.js";
export type { OtlpExportTraceRequest, ReporterIdentity } from "./otlp.js";
export { createSynchronousScope } from "./scope.js";
export { attachSourceContext, setSourceReader } from "./source-context.js";
export { createSynchronousSpanScope } from "./span-scope.js";
export { DEFAULT_STACK_FRAME_LIMIT, applyStackFrameLimit } from "./stack-frame-limit.js";
export { HttpLogTransport, HttpTransport, OtlpSpanTransport } from "./transport.js";
export type {
  Breadcrumb,
  CaptureMechanism,
  CaptureLogOptions,
  CaptureOptions,
  ClientOptions,
  ErrorReport,
  FinishedSpan,
  FrameOrigin,
  JsonPrimitive,
  JsonValue,
  LogLevel,
  LogRecord,
  LogRecordBatch,
  LogTransport,
  LogTransportErrorContext,
  NormalizedException,
  ReporterInfo,
  ReporterNamespace,
  RuntimeInfo,
  RuntimeInitOptions,
  Scope,
  ScopeData,
  ServiceInfo,
  SourceLocation,
  SourceReader,
  Span,
  SpanContext,
  SpanKind,
  SpanOptions,
  SpanScope,
  SpanStatusCode,
  SpanTransport,
  SpanTransportErrorContext,
  StackFrame,
  Tags,
  ThrownValue,
  TraceContext,
  Transport,
  TransportErrorContext,
  UserContext,
} from "./types.js";
