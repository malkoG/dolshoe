import { LogRecord, LogRecordBatchRequest } from "./log-record.contract";

export const logRecordExample = {
  eventId: "6608e55d-1b24-4d9a-951f-7e7211f92f44",
  occurredAt: "2026-07-25T05:30:01.123Z",
  level: "info",
  message: "Payment authorization completed",
  category: ["checkout", "payment"],
  service: {
    name: "checkout-api",
    environment: "production",
    release: "2026.07.25.1",
  },
  runtime: {
    name: "node",
    version: "24.4.0",
  },
  reporter: {
    name: "dolshoe-node",
    version: "0.1.0",
  },
  trace: {
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    spanId: "00f067aa0ba902b7",
  },
  attributes: {
    "payment.method": "card",
    "payment.amount": 45_000,
    "payment.currency": "KRW",
  },
} satisfies LogRecord;

export const logRecordBatchExample = {
  schemaVersion: 1,
  records: [{ ...logRecordExample }],
} satisfies LogRecordBatchRequest;
