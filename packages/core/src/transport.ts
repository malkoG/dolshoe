import { toOtlpTraceRequest } from "./otlp.js";
import type { ReporterIdentity } from "./otlp.js";
import type {
  ErrorReport,
  FinishedSpan,
  LogRecord,
  LogRecordBatch,
  LogTransport,
  SpanTransport,
  Transport,
} from "./types.js";

interface FetchTransportOptions {
  endpoint: string | URL;
  headers?: Readonly<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
}

async function postJson(
  fetchImplementation: typeof globalThis.fetch,
  endpoint: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
): Promise<void> {
  const response = await fetchImplementation(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    const detail = responseBody.length > 1_024 ? `${responseBody.slice(0, 1_023)}…` : responseBody;
    throw new Error(
      `Dolshoe ingestion failed with HTTP ${response.status}${detail === "" ? "" : `: ${detail}`}`,
    );
  }
}

export class HttpTransport implements Transport {
  readonly #endpoint: string;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: FetchTransportOptions) {
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (fetchImplementation == null) {
      throw new Error("Dolshoe requires a Fetch API implementation.");
    }

    this.#endpoint = options.endpoint.toString();
    this.#fetch = fetchImplementation;
    this.#headers = options.headers ?? {};
  }

  async send(report: ErrorReport): Promise<void> {
    await postJson(this.#fetch, this.#endpoint, this.#headers, report);
  }
}

export class HttpLogTransport implements LogTransport {
  readonly #endpoint: string;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: FetchTransportOptions) {
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (fetchImplementation == null) {
      throw new Error("Dolshoe requires a Fetch API implementation.");
    }

    this.#endpoint = options.endpoint.toString();
    this.#fetch = fetchImplementation;
    this.#headers = options.headers ?? {};
  }

  async send(records: readonly LogRecord[]): Promise<void> {
    if (records.length === 0 || records.length > 100) {
      throw new Error("Dolshoe log batches must contain between 1 and 100 records.");
    }

    const batch: LogRecordBatch = {
      schemaVersion: 1,
      records: [...records],
    };
    await postJson(this.#fetch, this.#endpoint, this.#headers, batch);
  }
}

interface SpanTransportOptions extends FetchTransportOptions {
  identity: ReporterIdentity;
}

/**
 * Spans go out as OTLP/HTTP JSON — the same format any OpenTelemetry exporter
 * would send, and the only one Dolshoe's trace endpoints read. Nothing about
 * this payload is Dolshoe-specific, so a reporter and a collector are
 * interchangeable from the server's point of view.
 */
export class OtlpSpanTransport implements SpanTransport {
  readonly #endpoint: string;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #fetch: typeof globalThis.fetch;
  readonly #identity: ReporterIdentity;

  constructor(options: SpanTransportOptions) {
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (fetchImplementation == null) {
      throw new Error("Dolshoe requires a Fetch API implementation.");
    }

    this.#endpoint = options.endpoint.toString();
    this.#fetch = fetchImplementation;
    this.#headers = options.headers ?? {};
    this.#identity = options.identity;
  }

  async send(spans: readonly FinishedSpan[]): Promise<void> {
    if (spans.length === 0 || spans.length > 1_000) {
      throw new Error("Dolshoe span exports must contain between 1 and 1000 spans.");
    }

    await postJson(
      this.#fetch,
      this.#endpoint,
      this.#headers,
      toOtlpTraceRequest(spans, this.#identity),
    );
  }
}
