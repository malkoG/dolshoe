import { OtlpExportTraceServiceRequest, OtlpSpan } from "./otlp-trace.contract";

export const OTLP_TRACE_EXAMPLE_TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

/** The root of the example trace, on its own for tests that need one span. */
export const otlpRootSpanExample = {
  traceId: OTLP_TRACE_EXAMPLE_TRACE_ID,
  spanId: "00f067aa0ba902b7",
  name: "POST /checkout",
  kind: 2,
  startTimeUnixNano: "1784957401000000000",
  endTimeUnixNano: "1784957401412000000",
  attributes: [
    { key: "http.request.method", value: { stringValue: "POST" } },
    { key: "http.response.status_code", value: { intValue: "500" } },
  ],
  status: { code: 0 },
} satisfies OtlpSpan;

/**
 * One checkout request as OpenTelemetry would export it: a server root span, the
 * outbound payment call it made, and the database query that failed underneath.
 *
 * @remarks
 * The trace id matches the one in `log-record.examples.ts`, so the example log
 * record and these spans describe the same request. Shared by the OpenAPI body
 * example, the contract and mapping specs, and the e2e suite — a change here is
 * meant to be felt in all four.
 */
export const otlpTraceExportExample = {
  resourceSpans: [
    {
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "checkout-api" } },
          { key: "service.version", value: { stringValue: "2026.07.25.1" } },
          { key: "deployment.environment.name", value: { stringValue: "production" } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: "@dolshoe/node", version: "0.1.0" },
          spans: [
            otlpRootSpanExample,
            {
              traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
              spanId: "1a2b3c4d5e6f7081",
              parentSpanId: "00f067aa0ba902b7",
              name: "authorize payment",
              kind: 3,
              startTimeUnixNano: "1784957401020000000",
              endTimeUnixNano: "1784957401180000000",
              attributes: [{ key: "payment.method", value: { stringValue: "card" } }],
              status: { code: 1 },
            },
            {
              traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
              spanId: "91827364554637f0",
              parentSpanId: "1a2b3c4d5e6f7081",
              name: "db.query",
              kind: 1,
              startTimeUnixNano: "1784957401040000000",
              endTimeUnixNano: "1784957401150000000",
              attributes: [{ key: "db.system.name", value: { stringValue: "postgresql" } }],
              status: { code: 2, message: "connection reset by peer" },
            },
          ],
        },
      ],
    },
  ],
} satisfies OtlpExportTraceServiceRequest;
