import { SpanDetailRow, SpanRepository, TraceRootRow } from "./span.repository";
import { otlpRootSpanExample, otlpTraceExportExample } from "./otlp-trace.examples";
import { TraceService } from "./trace.service";

function serviceWith(store: jest.Mock) {
  return new TraceService({ store } as unknown as SpanRepository);
}

function readingService(repository: Partial<SpanRepository>) {
  return new TraceService(repository as SpanRepository);
}

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const TRACE_START = 1_784_957_401_000_000_000n;

function rootRow(overrides: Partial<TraceRootRow> = {}): TraceRootRow {
  return {
    traceId: TRACE_ID,
    spanId: "00f067aa0ba902b7",
    name: "POST /checkout",
    kind: "server",
    statusCode: "unset",
    serviceName: "checkout-api",
    environment: "production",
    startedAt: new Date("2026-07-25T05:30:01.000Z"),
    durationNanoseconds: 412_000_000n,
    ...overrides,
  };
}

function detailRow(
  spanId: string,
  parentSpanId: string | null,
  offsetNanoseconds: bigint,
  durationNanoseconds: bigint,
  overrides: Partial<SpanDetailRow> = {},
): SpanDetailRow {
  return {
    id: `00000000-0000-4000-8000-0000000000${spanId.slice(0, 2)}`,
    spanId,
    parentSpanId,
    name: `span ${spanId}`,
    kind: "internal",
    statusCode: "unset",
    statusMessage: null,
    serviceName: "checkout-api",
    scopeName: "@dolshoe/node",
    scopeVersion: "0.1.0",
    startedAt: new Date(Number((TRACE_START + offsetNanoseconds) / 1_000_000n)),
    startTimeUnixNano: TRACE_START + offsetNanoseconds,
    durationNanoseconds,
    attributes: null,
    resourceAttributes: null,
    ...overrides,
  };
}

describe("TraceService", () => {
  it("stores every readable span against the project", async () => {
    const store = jest.fn().mockResolvedValue(3);
    const response = await serviceWith(store).export(otlpTraceExportExample, "project-id");

    expect(response).toEqual({ partialSuccess: {} });
    expect(store).toHaveBeenCalledWith(
      "project-id",
      expect.arrayContaining([expect.objectContaining({ name: "POST /checkout" })]),
    );
    expect(store.mock.calls[0]?.[1]).toHaveLength(3);
  });

  it("reports unreadable spans as a partial success rather than failing", async () => {
    const store = jest.fn().mockResolvedValue(1);
    const response = await serviceWith(store).export(
      {
        resourceSpans: [
          {
            scopeSpans: [
              { spans: [otlpRootSpanExample, { ...otlpRootSpanExample, spanId: "nope" }] },
            ],
          },
        ],
      },
      "project-id",
    );

    // A string, because rejectedSpans is a proto3 int64.
    expect(response).toEqual({
      partialSuccess: { rejectedSpans: "1", errorMessage: expect.any(String) },
    });
    // The readable span was still stored.
    expect(store.mock.calls[0]?.[1]).toHaveLength(1);
  });

  it("accepts an export with nothing in it", async () => {
    const store = jest.fn().mockResolvedValue(0);
    const response = await serviceWith(store).export({ resourceSpans: [] }, "project-id");

    expect(response).toEqual({ partialSuccess: {} });
    expect(store).toHaveBeenCalledWith("project-id", []);
  });

  describe("listing traces", () => {
    it("summarizes a trace by its root and folds in the span counts", async () => {
      const service = readingService({
        listRootSpans: jest.fn().mockResolvedValue([rootRow()]),
        countSpansByTrace: jest
          .fn()
          .mockResolvedValue([{ traceId: TRACE_ID, total: 4, errors: 2 }]),
      });

      const { traces } = await service.list("org-id", "project-id");

      expect(traces).toEqual([
        {
          traceId: TRACE_ID,
          rootSpanId: "00f067aa0ba902b7",
          name: "POST /checkout",
          kind: "server",
          serviceName: "checkout-api",
          environment: "production",
          startedAt: "2026-07-25T05:30:01.000Z",
          // A number, not the bigint the column holds: JSON.stringify throws on one.
          durationNanoseconds: 412_000_000,
          statusCode: "unset",
          spanCount: 4,
          errorSpanCount: 2,
        },
      ]);
    });

    it("does not ask for counts when there are no traces", async () => {
      const countSpansByTrace = jest.fn().mockResolvedValue([]);
      const service = readingService({
        listRootSpans: jest.fn().mockResolvedValue([]),
        countSpansByTrace,
      });

      await expect(service.list("org-id", "project-id")).resolves.toEqual({ traces: [] });
      expect(countSpansByTrace).toHaveBeenCalledWith("project-id", []);
    });
  });

  describe("reading one trace", () => {
    it("orders spans for a waterfall and positions each against the trace start", async () => {
      const service = readingService({
        listSpansForTrace: jest
          .fn()
          .mockResolvedValue([
            detailRow("00f067aa0ba902b7", null, 0n, 412_000_000n),
            detailRow("1a2b3c4d5e6f7081", "00f067aa0ba902b7", 20_000_000n, 160_000_000n),
            detailRow("91827364554637f0", "1a2b3c4d5e6f7081", 40_000_000n, 110_000_000n),
          ]),
      });

      const { trace, spans } = await service.detail("org-id", "project-id", TRACE_ID);

      expect(trace).toEqual({
        traceId: TRACE_ID,
        startedAt: "2026-07-25T05:30:01.000Z",
        durationNanoseconds: 412_000_000,
        spanCount: 3,
        truncated: false,
      });
      expect(spans.map((span) => [span.depth, span.startOffsetNanoseconds])).toEqual([
        [0, 0],
        [1, 20_000_000],
        [2, 40_000_000],
      ]);
    });

    // The waterfall's total width is the whole trace, which a long child can
    // outlast even when the root finished first.
    it("measures the trace to the last span that ended, not the root", async () => {
      const service = readingService({
        listSpansForTrace: jest
          .fn()
          .mockResolvedValue([
            detailRow("00f067aa0ba902b7", null, 0n, 10_000_000n),
            detailRow("1a2b3c4d5e6f7081", "00f067aa0ba902b7", 5_000_000n, 900_000_000n),
          ]),
      });

      const { trace } = await service.detail("org-id", "project-id", TRACE_ID);

      expect(trace.durationNanoseconds).toBe(905_000_000);
    });

    it("measures from the earliest span even when it is not returned first", async () => {
      const service = readingService({
        listSpansForTrace: jest
          .fn()
          .mockResolvedValue([
            detailRow("bbbbbbbbbbbbbbbb", null, 50_000_000n, 10_000_000n),
            detailRow("aaaaaaaaaaaaaaaa", null, 0n, 10_000_000n),
          ]),
      });

      const { trace, spans } = await service.detail("org-id", "project-id", TRACE_ID);

      expect(trace.startedAt).toBe("2026-07-25T05:30:01.000Z");
      expect(spans.map((span) => span.startOffsetNanoseconds)).toEqual([0, 50_000_000]);
    });

    it("says so when a trace held more spans than it will return", async () => {
      const rows = Array.from({ length: 2_001 }, (_unused, index) =>
        detailRow(String(index).padStart(16, "0"), null, BigInt(index) * 1_000n, 1_000n),
      );
      const service = readingService({ listSpansForTrace: jest.fn().mockResolvedValue(rows) });

      const { trace, spans } = await service.detail("org-id", "project-id", TRACE_ID);

      expect(trace.truncated).toBe(true);
      expect(trace.spanCount).toBe(2_000);
      expect(spans).toHaveLength(2_000);
    });

    // Not a 404: the caller asked about a trace id, and "nothing is stored under
    // it" is a true answer whether it never existed or its spans aged out.
    it("reads a trace nobody reported as an empty one", async () => {
      const service = readingService({ listSpansForTrace: jest.fn().mockResolvedValue([]) });

      const { trace, spans } = await service.detail("org-id", "project-id", TRACE_ID);

      expect(spans).toEqual([]);
      expect(trace).toMatchObject({ traceId: TRACE_ID, spanCount: 0, durationNanoseconds: 0 });
    });
  });
});
