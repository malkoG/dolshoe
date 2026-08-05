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
      "TypeError: Cannot read properties of undefined\n    at submitOrder (file:///srv/app/order.js:42:18)\n    at Layer.handle (/srv/app/node_modules/express/lib/router/layer.js:95:5)\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
    frames: [
      {
        functionName: "submitOrder",
        fileName: "file:///srv/app/order.js",
        lineNumber: 42,
        columnNumber: 18,
        sourceLine: "  const total = basket.lines.reduce(sumLine, 0);",
        preContext: [
          "async function submitOrder(request) {",
          "  const basket = await loadBasket(request.session);",
          "",
        ],
        postContext: ["", "  return charge(request.customer, total);", "}"],
        inApp: true,
        origin: "app",
      },
      {
        functionName: "Layer.handle",
        fileName: "/srv/app/node_modules/express/lib/router/layer.js",
        lineNumber: 95,
        columnNumber: 5,
        inApp: false,
        origin: "dependency",
      },
      {
        functionName: "process.processTicksAndRejections",
        fileName: "node:internal/process/task_queues",
        lineNumber: 105,
        columnNumber: 5,
        inApp: false,
        origin: "runtime",
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
            preContext: ["async def settle_invoice(invoice):", "    validate(invoice)"],
            postContext: ["    invoice.mark_settled()", "    return invoice"],
            inApp: true,
            origin: "app",
          },
          {
            moduleName: "asyncio.tasks",
            functionName: "wait_for",
            fileName: "/usr/local/lib/python3.14/asyncio/tasks.py",
            lineNumber: 507,
            sourceLine: "return await fut",
            inApp: false,
            origin: "runtime",
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
