import type { ErrorReport, Transport } from "./types.js";

interface FetchTransportOptions {
  endpoint: string | URL;
  headers?: Readonly<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
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
    const response = await this.#fetch(this.#endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...this.#headers,
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      const detail =
        responseBody.length > 1_024 ? `${responseBody.slice(0, 1_023)}…` : responseBody;
      throw new Error(
        `Dolshoe ingestion failed with HTTP ${response.status}${detail === "" ? "" : `: ${detail}`}`,
      );
    }
  }
}
