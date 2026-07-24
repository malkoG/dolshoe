import {
  Client,
  captureException,
  close as closeCore,
  flush,
  setCurrentClient,
  type RuntimeInitOptions,
} from "@dolshoe/core";

const REPORTER_VERSION = "0.1.0";

interface BunGlobal {
  version?: string;
}

let removeGlobalHandlers: (() => void) | undefined;

function getBunVersion(): string | undefined {
  return (globalThis as typeof globalThis & { Bun?: BunGlobal }).Bun?.version;
}

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

  const version = getBunVersion();
  const client = new Client({
    ...clientOptions,
    runtime: {
      name: "bun",
      ...(version == null ? {} : { version }),
    },
    reporter: {
      name: "dolshoe-bun",
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
  captureException,
  captureMessage,
  flush,
  getClient,
  normalizeException,
  parseJavaScriptStack,
} from "@dolshoe/core";
export type { CaptureOptions, ErrorReport, RuntimeInitOptions, Transport } from "@dolshoe/core";
