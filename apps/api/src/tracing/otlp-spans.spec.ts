import { OtlpExportTraceServiceRequest, OtlpSpan } from "./otlp-trace.contract";
import {
  OTLP_TRACE_EXAMPLE_TRACE_ID,
  otlpRootSpanExample,
  otlpTraceExportExample,
} from "./otlp-trace.examples";
import { flattenAnyValue, flattenAttributes, flattenOtlpSpans } from "./otlp-spans";

function exportOf(spans: readonly OtlpSpan[]): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }] },
        scopeSpans: [{ scope: { name: "@dolshoe/node", version: "0.1.0" }, spans: [...spans] }],
      },
    ],
  };
}

describe("flattenAnyValue", () => {
  it("reads every scalar variant", () => {
    expect(flattenAnyValue({ stringValue: "card" })).toBe("card");
    expect(flattenAnyValue({ boolValue: false })).toBe(false);
    expect(flattenAnyValue({ doubleValue: 1.5 })).toBe(1.5);
    expect(flattenAnyValue({ intValue: "500" })).toBe(500);
    expect(flattenAnyValue({ intValue: 500 })).toBe(500);
    expect(flattenAnyValue({ bytesValue: "3q2+7w==" })).toBe("3q2+7w==");
  });

  // The reason an int64 is a string on the wire in the first place: past
  // MAX_SAFE_INTEGER, becoming a number would silently change the value.
  it("keeps an int64 that a number could not hold as a string", () => {
    expect(flattenAnyValue({ intValue: "9223372036854775807" })).toBe("9223372036854775807");
  });

  it("reads nested arrays and maps", () => {
    expect(
      flattenAnyValue({
        arrayValue: { values: [{ stringValue: "a" }, { intValue: "2" }] },
      }),
    ).toEqual(["a", 2]);

    expect(
      flattenAnyValue({
        kvlistValue: { values: [{ key: "nested", value: { stringValue: "yes" } }] },
      }),
    ).toEqual({ nested: "yes" });
  });

  it("truncates an over-long string", () => {
    const value = flattenAnyValue({ stringValue: "x".repeat(10_000) });
    expect(typeof value === "string" && value.length).toBe(8_192);
  });

  it("has no reading for a value with no variant set", () => {
    expect(flattenAnyValue({})).toBeUndefined();
    expect(flattenAnyValue(undefined)).toBeUndefined();
  });

  it("stops recursing before a deeply nested value can exhaust the stack", () => {
    let value: Record<string, unknown> = { stringValue: "bottom" };
    for (let depth = 0; depth < 50; depth += 1) {
      value = { arrayValue: { values: [value] } };
    }

    // The outer levels still read; the bottom is dropped rather than followed.
    const flattened = flattenAnyValue(value);
    expect(flattened).not.toBeUndefined();
    expect(JSON.stringify(flattened)).not.toContain("bottom");
  });
});

describe("flattenAttributes", () => {
  it("turns key-value pairs into an object", () => {
    expect(
      flattenAttributes([
        { key: "http.request.method", value: { stringValue: "POST" } },
        { key: "http.response.status_code", value: { intValue: "500" } },
      ]),
    ).toEqual({ "http.request.method": "POST", "http.response.status_code": 500 });
  });

  it("keeps the last value of a repeated key", () => {
    expect(
      flattenAttributes([
        { key: "region", value: { stringValue: "ap-northeast-2" } },
        { key: "region", value: { stringValue: "us-east-1" } },
      ]),
    ).toEqual({ region: "us-east-1" });
  });

  it("leaves out a pair with no readable value", () => {
    expect(flattenAttributes([{ key: "empty" }, { key: "", value: { stringValue: "x" } }])).toEqual(
      {},
    );
  });
});

describe("flattenOtlpSpans", () => {
  it("maps the documented export into its three spans", () => {
    const { spans, rejected } = flattenOtlpSpans(otlpTraceExportExample);

    expect(rejected).toBe(0);
    expect(spans).toHaveLength(3);
    expect(spans.map((span) => span.name)).toEqual([
      "POST /checkout",
      "authorize payment",
      "db.query",
    ]);
    expect(spans.map((span) => span.kind)).toEqual(["server", "client", "internal"]);
    expect(spans.map((span) => span.statusCode)).toEqual(["unset", "ok", "error"]);
    expect(spans.every((span) => span.traceId === OTLP_TRACE_EXAMPLE_TRACE_ID)).toBe(true);
  });

  it("links each span to its parent, and leaves the root without one", () => {
    const { spans } = flattenOtlpSpans(otlpTraceExportExample);

    expect(spans.map((span) => [span.spanId, span.parentSpanId])).toEqual([
      ["00f067aa0ba902b7", null],
      ["1a2b3c4d5e6f7081", "00f067aa0ba902b7"],
      ["91827364554637f0", "1a2b3c4d5e6f7081"],
    ]);
  });

  it("lifts service identity out of the resource", () => {
    const [span] = flattenOtlpSpans(otlpTraceExportExample).spans;

    expect(span).toMatchObject({
      serviceName: "checkout-api",
      release: "2026.07.25.1",
      environment: "production",
      scopeName: "@dolshoe/node",
      scopeVersion: "0.1.0",
    });
    expect(span?.resourceAttributes).toMatchObject({ "service.name": "checkout-api" });
  });

  it("reads the environment attribute under its pre-rename name too", () => {
    const { spans } = flattenOtlpSpans({
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "checkout-api" } },
              { key: "deployment.environment", value: { stringValue: "staging" } },
            ],
          },
          scopeSpans: [{ spans: [otlpRootSpanExample] }],
        },
      ],
    });

    expect(spans[0]?.environment).toBe("staging");
  });

  it("falls back to unknown_service rather than dropping an unlabelled batch", () => {
    const { spans, rejected } = flattenOtlpSpans({
      resourceSpans: [{ scopeSpans: [{ spans: [otlpRootSpanExample] }] }],
    });

    expect(rejected).toBe(0);
    expect(spans[0]?.serviceName).toBe("unknown_service");
  });

  it("derives the start and the exact duration from the nanosecond timestamps", () => {
    const [span] = flattenOtlpSpans(otlpTraceExportExample).spans;

    expect(span?.startTimeUnixNano).toBe(1_784_957_401_000_000_000n);
    expect(span?.durationNanoseconds).toBe(412_000_000n);
    // The same instant as `logRecordExample.occurredAt`: one request, two signals.
    expect(span?.startedAt.toISOString()).toBe("2026-07-25T05:30:01.000Z");
  });

  it("normalizes a base64 id to the same hex as the hex form", () => {
    const hex = flattenOtlpSpans(exportOf([otlpRootSpanExample])).spans[0];
    const base64 = flattenOtlpSpans(
      exportOf([
        {
          ...otlpRootSpanExample,
          traceId: Buffer.from(otlpRootSpanExample.traceId, "hex").toString("base64"),
          spanId: Buffer.from(otlpRootSpanExample.spanId, "hex").toString("base64"),
        },
      ]),
    ).spans[0];

    expect(base64?.traceId).toBe(hex?.traceId);
    expect(base64?.spanId).toBe(hex?.spanId);
  });

  it("lowercases an uppercase hex id", () => {
    const { spans } = flattenOtlpSpans(
      exportOf([
        {
          ...otlpRootSpanExample,
          traceId: otlpRootSpanExample.traceId.toUpperCase(),
          spanId: otlpRootSpanExample.spanId.toUpperCase(),
        },
      ]),
    );

    expect(spans[0]?.traceId).toBe(OTLP_TRACE_EXAMPLE_TRACE_ID);
    expect(spans[0]?.spanId).toBe("00f067aa0ba902b7");
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["all-zero", "0000000000000000"],
  ])("treats an %s parentSpanId as a root", (_label, parentSpanId) => {
    const { spans } = flattenOtlpSpans(
      exportOf([{ ...otlpRootSpanExample, ...(parentSpanId == null ? {} : { parentSpanId }) }]),
    );

    expect(spans[0]?.parentSpanId).toBeNull();
  });

  it.each([
    ["a malformed traceId", { traceId: "not-a-trace-id" }],
    ["an all-zero traceId", { traceId: "0".repeat(32) }],
    ["a malformed spanId", { spanId: "zz" }],
    ["no startTimeUnixNano", { startTimeUnixNano: "0" }],
    ["no endTimeUnixNano", { endTimeUnixNano: undefined }],
    ["a zero endTimeUnixNano", { endTimeUnixNano: "0" }],
    ["an end before its start", { endTimeUnixNano: "1784957400000000000" }],
  ])("rejects a span with %s while keeping its siblings", (_label, overrides) => {
    const broken = { ...otlpRootSpanExample, ...overrides };
    const sibling = { ...otlpRootSpanExample, spanId: "aaaaaaaaaaaaaaaa" };

    const { spans, rejected, firstRejection } = flattenOtlpSpans(exportOf([broken, sibling]));

    expect(rejected).toBe(1);
    expect(firstRejection).toEqual(expect.any(String));
    expect(spans.map((span) => span.spanId)).toEqual(["aaaaaaaaaaaaaaaa"]);
  });

  it("never throws, whatever a span carried", () => {
    expect(() =>
      flattenOtlpSpans(exportOf([{ ...otlpRootSpanExample, traceId: "" }])),
    ).not.toThrow();
    expect(() => flattenOtlpSpans({})).not.toThrow();
    expect(flattenOtlpSpans({})).toEqual({ spans: [], rejected: 0 });
  });

  it("truncates an over-long span name", () => {
    const { spans } = flattenOtlpSpans(
      exportOf([{ ...otlpRootSpanExample, name: "n".repeat(2_000) }]),
    );

    expect(spans[0]?.name).toHaveLength(500);
  });

  it("reads a span kind and status sent as names rather than numbers", () => {
    const { spans } = flattenOtlpSpans(
      exportOf([
        {
          ...otlpRootSpanExample,
          kind: "SPAN_KIND_SERVER",
          status: { code: "STATUS_CODE_ERROR", message: "boom" },
        },
      ]),
    );

    expect(spans[0]).toMatchObject({ kind: "server", statusCode: "error", statusMessage: "boom" });
  });

  it("reads an unspecified kind as internal, the way the proto asks receivers to", () => {
    const { spans } = flattenOtlpSpans(exportOf([{ ...otlpRootSpanExample, kind: 0 }]));

    expect(spans[0]?.kind).toBe("internal");
  });

  // A kind OpenTelemetry has not defined yet must not cost us the span.
  it("keeps a span whose kind it does not recognize", () => {
    const { spans, rejected } = flattenOtlpSpans(exportOf([{ ...otlpRootSpanExample, kind: 99 }]));

    expect(rejected).toBe(0);
    expect(spans[0]?.kind).toBe("internal");
  });

  it("stores no attributes rather than an empty object", () => {
    const { spans } = flattenOtlpSpans(exportOf([{ ...otlpRootSpanExample, attributes: [] }]));

    expect(spans[0]?.attributes).toBeNull();
  });
});
