import { SpanRepository } from "./span.repository";
import { otlpRootSpanExample, otlpTraceExportExample } from "./otlp-trace.examples";
import { TraceService } from "./trace.service";

function serviceWith(store: jest.Mock) {
  return new TraceService({ store } as unknown as SpanRepository);
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
});
