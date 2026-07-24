import { ErrorReportRequest } from "./error-report.contract";

export const nodeErrorReportExample = {
  schemaVersion: 1,
  eventId: "bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7",
  occurredAt: "2026-07-24T08:30:00.000Z",
  service: {
    name: "checkout-api",
    environment: "production",
    release: "2026.07.24.1",
  },
  runtime: {
    name: "node",
    version: "24.4.1",
  },
  reporter: {
    name: "dolshoe-node",
    version: "0.1.0",
  },
  mechanism: {
    type: "unhandledRejection",
    handled: false,
  },
  exception: {
    type: "TypeError",
    message: "Cannot read properties of undefined",
    stacktrace:
      "TypeError: Cannot read properties of undefined\n    at submitOrder (file:///srv/app/order.js:42:18)",
    frames: [
      {
        functionName: "submitOrder",
        fileName: "file:///srv/app/order.js",
        lineNumber: 42,
        columnNumber: 18,
        inApp: true,
      },
    ],
    cause: {
      type: "Error",
      message: "Cart was not loaded",
    },
  },
  trace: {
    traceId: "0af7651916cd43dd8448eb211c80319c",
    spanId: "b7ad6b7169203331",
  },
  attributes: {
    route: "/orders",
    retryCount: 0,
  },
} satisfies ErrorReportRequest;

export const pythonErrorReportExample = {
  schemaVersion: 1,
  eventId: "95f210f5-0051-4031-ac4a-8b82e4497f67",
  occurredAt: "2026-07-24T08:31:00.000Z",
  service: {
    name: "billing-worker",
    environment: "production",
  },
  runtime: {
    name: "cpython",
    version: "3.14.0",
  },
  reporter: {
    name: "dolshoe-python",
    version: "0.1.0",
  },
  mechanism: {
    type: "sys.excepthook",
    handled: false,
  },
  exception: {
    type: "ExceptionGroup",
    message: "settlement failures (2 sub-exceptions)",
    children: [
      {
        type: "TimeoutError",
        message: "processor timed out",
        frames: [
          {
            moduleName: "billing.settle",
            functionName: "settle_invoice",
            fileName: "/srv/app/billing/settle.py",
            lineNumber: 73,
            sourceLine: "await processor.charge(invoice)",
            inApp: true,
          },
        ],
      },
      {
        type: "ValueError",
        message: "currency is missing",
      },
    ],
  },
} satisfies ErrorReportRequest;
