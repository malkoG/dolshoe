import {
  otlpExportTraceServiceRequestSchema,
  otlpTraceOpenApiSchemas,
} from "./otlp-trace.contract";
import { otlpRootSpanExample, otlpTraceExportExample } from "./otlp-trace.examples";

function spanTemplate() {
  return otlpRootSpanExample;
}

function requestWithSpans(spans: readonly unknown[]): unknown {
  return {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }] },
        scopeSpans: [{ spans }],
      },
    ],
  };
}

describe("OTLP trace contract", () => {
  it("accepts the documented export", () => {
    expect(otlpExportTraceServiceRequestSchema.parse(otlpTraceExportExample)).toMatchObject(
      otlpTraceExportExample,
    );
  });

  it("accepts an empty export, which is what an idle exporter sends", () => {
    expect(otlpExportTraceServiceRequestSchema.safeParse({ resourceSpans: [] }).success).toBe(true);
    expect(otlpExportTraceServiceRequestSchema.safeParse({}).success).toBe(true);
  });

  // The forward-compatibility guarantee: OpenTelemetry keeps adding fields, and
  // a receiver that rejects them stops working on the next spec release.
  it("accepts wire fields it does not read yet", () => {
    const result = otlpExportTraceServiceRequestSchema.safeParse({
      resourceSpans: [
        {
          schemaUrl: "https://opentelemetry.io/schemas/1.30.0",
          resource: { attributes: [], droppedAttributesCount: 0 },
          scopeSpans: [
            {
              schemaUrl: "https://opentelemetry.io/schemas/1.30.0",
              spans: [
                {
                  ...spanTemplate(),
                  flags: 256,
                  traceState: "rojo=00f067aa0ba902b7",
                  droppedAttributesCount: 2,
                  events: [{ timeUnixNano: "1784957401100000000", name: "exception" }],
                  links: [
                    { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts a timestamp sent as a number as well as a string", () => {
    const result = otlpExportTraceServiceRequestSchema.safeParse(
      requestWithSpans([{ ...spanTemplate(), startTimeUnixNano: 1_785_044_997_000_000_000 }]),
    );

    expect(result.success).toBe(true);
  });

  it("accepts a span kind sent as its name as well as its number", () => {
    const result = otlpExportTraceServiceRequestSchema.safeParse(
      requestWithSpans([{ ...spanTemplate(), kind: "SPAN_KIND_SERVER" }]),
    );

    expect(result.success).toBe(true);
  });

  it("rejects a request carrying more than 1000 spans", () => {
    const spans = Array.from({ length: 1_001 }, () => spanTemplate());
    const result = otlpExportTraceServiceRequestSchema.safeParse(requestWithSpans(spans));

    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "A request cannot carry more than 1000 spans." }),
      ]),
    );
  });

  it("rejects a body that is not an export request at all", () => {
    expect(otlpExportTraceServiceRequestSchema.safeParse({ resourceSpans: "nope" }).success).toBe(
      false,
    );
    expect(otlpExportTraceServiceRequestSchema.safeParse([]).success).toBe(false);
  });

  it("publishes OTLP schemas for OpenAPI", () => {
    expect(otlpTraceOpenApiSchemas).toEqual(
      expect.objectContaining({
        OtlpAnyValue: expect.any(Object),
        OtlpKeyValue: expect.any(Object),
        OtlpSpan: expect.any(Object),
        OtlpScopeSpans: expect.any(Object),
        OtlpResourceSpans: expect.any(Object),
        OtlpExportTraceServiceRequest: expect.any(Object),
        OtlpExportTraceServiceResponse: expect.any(Object),
      }),
    );
  });
});
