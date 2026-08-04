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

let removeGlobalHandlers: (() => void) | undefined;

function onUncaughtException(error: Error, origin: NodeJS.UncaughtExceptionOrigin): void {
  captureException(error, {
    mechanism: {
      type: origin,
      handled: false,
    },
  });
  void flush(2_000);
}

function onBeforeExit(): void {
  void flush(2_000);
}

function installGlobalHandlers(): () => void {
  process.on("uncaughtExceptionMonitor", onUncaughtException);
  process.once("beforeExit", onBeforeExit);

  return () => {
    process.off("uncaughtExceptionMonitor", onUncaughtException);
    process.off("beforeExit", onBeforeExit);
  };
}

export function init(options: RuntimeInitOptions): Client {
  removeGlobalHandlers?.();
  const { captureUnhandledErrors, ...clientOptions } = options;

  const client = new Client({
    ...clientOptions,
    // After the spread: spreading clientOptions first would write an absent
    // spanScope straight over this default. An application may still bring its
    // own, which the ?? preserves.
    spanScope: clientOptions.spanScope ?? createAsyncSpanScope(),
    runtime: {
      name: "node",
      version: process.versions.node,
    },
    reporter: {
      name: "dolshoe-node",
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
