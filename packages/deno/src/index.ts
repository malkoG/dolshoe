import {
  Client,
  captureException,
  close as closeCore,
  flush,
  setCurrentClient,
  type RuntimeInitOptions,
} from "@dolshoe/core";

import { createAsyncSpanScope } from "./span-scope.js";

const REPORTER_VERSION = "0.1.0";

interface DenoGlobal {
  version?: {
    deno?: string;
  };
}

let removeGlobalHandlers: (() => void) | undefined;

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
  const { captureUnhandledErrors, ...clientOptions } = options;

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
  return closeCore(timeoutMilliseconds);
}

export {
  activeSpan,
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
