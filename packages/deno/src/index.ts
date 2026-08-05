import {
  Client,
  DEFAULT_STACK_FRAME_LIMIT,
  applyStackFrameLimit,
  captureException,
  close as closeCore,
  flush,
  setCurrentClient,
  setSourceReader,
  type RuntimeInitOptions,
} from "@dolshoe/core";

import { createSourceReader } from "./source-reader.js";
import { createAsyncSpanScope } from "./span-scope.js";

const REPORTER_VERSION = "0.1.0";

interface DenoGlobal {
  version?: {
    deno?: string;
  };
}

let removeGlobalHandlers: (() => void) | undefined;
let restoreStackFrameLimit: (() => void) | undefined;

function getDenoVersion(): string | undefined {
  const deno = (globalThis as typeof globalThis & { Deno?: DenoGlobal }).Deno;
  return deno?.version?.deno;
}

function onError(event: ErrorEvent): void {
  captureException(event.error ?? event.message, {
    mechanism: {
      type: "error",
      handled: false,
    },
  });
  void flush(2_000);
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  captureException(event.reason, {
    mechanism: {
      type: "unhandledRejection",
      handled: false,
    },
  });
  void flush(2_000);
}

function installGlobalHandlers(): () => void {
  globalThis.addEventListener("error", onError);
  globalThis.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    globalThis.removeEventListener("error", onError);
    globalThis.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

export function init(options: RuntimeInitOptions): Client {
  removeGlobalHandlers?.();
  restoreStackFrameLimit?.();
  const { captureUnhandledErrors, stackFrameLimit, sourceContext, ...clientOptions } = options;

  restoreStackFrameLimit =
    stackFrameLimit === false
      ? undefined
      : applyStackFrameLimit(stackFrameLimit ?? DEFAULT_STACK_FRAME_LIMIT);

  setSourceReader(sourceContext === false ? undefined : createSourceReader());

  const version = getDenoVersion();
  const client = new Client({
    ...clientOptions,
    // After the spread: spreading clientOptions first would write an absent
    // spanScope straight over this default. An application may still bring its
    // own, which the ?? preserves.
    spanScope: clientOptions.spanScope ?? createAsyncSpanScope(),
    runtime: {
      name: "deno",
      ...(version == null ? {} : { version }),
    },
    reporter: {
      name: "dolshoe-deno",
      version: REPORTER_VERSION,
    },
  });

  setCurrentClient(client);
  removeGlobalHandlers = captureUnhandledErrors === false ? undefined : installGlobalHandlers();
  return client;
}

export async function close(timeoutMilliseconds?: number): Promise<boolean> {
  removeGlobalHandlers?.();
  removeGlobalHandlers = undefined;
  restoreStackFrameLimit?.();
  restoreStackFrameLimit = undefined;
  setSourceReader(undefined);
  return closeCore(timeoutMilliseconds);
}

export {
  DEFAULT_STACK_FRAME_LIMIT,
  activeSpan,
  applyStackFrameLimit,
  captureException,
  captureLog,
  captureMessage,
  flush,
  getClient,
  normalizeException,
  parseJavaScriptStack,
  startSpan,
  withSpan,
} from "@dolshoe/core";
export type {
  CaptureLogOptions,
  CaptureOptions,
  ErrorReport,
  FinishedSpan,
  LogLevel,
  LogRecord,
  LogRecordBatch,
  LogTransport,
  RuntimeInitOptions,
  Span,
  SpanContext,
  SpanKind,
  SpanOptions,
  SpanScope,
  SpanStatusCode,
  SpanTransport,
  Transport,
} from "@dolshoe/core";
