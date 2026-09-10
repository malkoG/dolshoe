import type { ErrorReportDetail, NormalizedException } from "../../lib/error-reports";
import type { ReportDetailChrome } from "./chrome";
import type { ReportDetailProps } from "./report-detail";

/**
 * Named states for Figma screen 22 — Report detail.
 *
 * @remarks
 * The page in Figma only draws the populated frame. Loading and error are
 * still reachable — the route that fetches the report can miss — and they
 * change the silhouette, so they earn factories. There is no empty: a
 * missing report is an error, not a blank panel.
 */
type Frame = NonNullable<NormalizedException["frames"]>[number];

const REPORT_ID = "7f2a9c1e-4b10-4d2a-9c1e-0a1b2c3d4e5f";
const TRACE_ID = "4f2a9c1e-aa10-4d2a-9c1e-0a1b2c3d4e5f";

function agoIso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

function libraryFrame(functionName: string, fileName: string, lineNumber: number): Frame {
  return {
    functionName,
    fileName,
    lineNumber,
    inApp: false,
    origin: "dependency",
  };
}

function runtimeFrame(functionName: string, fileName: string): Frame {
  return {
    functionName,
    fileName,
    inApp: false,
    origin: "runtime",
  };
}

const handleCheckout: Frame = {
  functionName: "handleCheckout",
  moduleName: "checkout-api",
  fileName: "checkout.ts",
  lineNumber: 214,
  columnNumber: 31,
  async: true,
  inApp: true,
  origin: "app",
  sourceLine: "const total = payment.amount + order.tax;",
  preContext: [
    "const cart = await loadCart(session.id);",
    "const order = buildOrder(cart);",
    "const payment = order.payment;",
  ],
  postContext: ["await authorize(total);", "return respond(order);"],
};

const processRequest: Frame = {
  functionName: "processRequest",
  moduleName: "checkout-api",
  fileName: "server.ts",
  lineNumber: 88,
  columnNumber: 5,
  async: true,
  inApp: true,
  origin: "app",
  sourceLine: "    return await handler(req, ctx);",
  preContext: ["for (const handler of handlers) {", "  if (handler.matches(req)) {"],
  postContext: ["  }", "}"],
};

const typeError: NormalizedException = {
  type: "TypeError",
  message: 'Cannot read properties of undefined (reading "amount")',
  code: "ERR_UNDEFINED_READ",
  stacktrace:
    'TypeError: Cannot read properties of undefined (reading "amount")\n    at handleCheckout (checkout.ts:214:31)',
  frames: [
    handleCheckout,
    processRequest,
    libraryFrame("dispatch", "node_modules/express/lib/router/index.js", 631),
    libraryFrame("handle", "node_modules/fastify/lib/handleRequest.js", 166),
    libraryFrame("Layer.handle_request", "node_modules/express/lib/router/layer.js", 95),
    libraryFrame("trim_prefix", "node_modules/raw-body/index.js", 191),
    runtimeFrame("processTicksAndRejections", "node:internal/process/task_queues:95:5"),
    runtimeFrame("Module._compile", "node:internal/modules/cjs/loader:1521:14"),
    runtimeFrame("Object.<anonymous>", "node:internal/modules/run_main:132:12"),
  ],
  cause: {
    type: "CardDeclinedError",
    message: "The card issuer declined the charge.",
    frames: [
      {
        functionName: "chargeCard",
        fileName: "src/payments/charge.ts",
        lineNumber: 88,
        inApp: true,
        origin: "app",
      },
      libraryFrame("create", "node_modules/stripe/lib/resources/Charges.js", 42),
      libraryFrame("request", "node_modules/undici/lib/client.js", 210),
    ],
  },
};

function chrome(current: string): ReportDetailChrome {
  return {
    orgName: "Acme Payments",
    orgInitial: "A",
    projectName: "checkout-api",
    projectInitial: "C",
    viewerName: "Koding Warrior",
    viewerHandle: "@kodingwarrior",
    trail: [
      { label: "Acme Payments" },
      { label: "checkout-api" },
      { label: "Reports" },
      { label: current, current: true },
    ],
  };
}

function populatedReport(): ErrorReportDetail {
  return {
    id: REPORT_ID,
    eventId: "evt_7f2a9c1e",
    occurredAt: agoIso(3 * 60 * 1000),
    receivedAt: agoIso(3 * 60 * 1000),
    project: { id: "prj_checkout", slug: "checkout-api", name: "checkout-api" },
    service: { name: "checkout-api", environment: "production", release: "1.42.0" },
    runtime: { name: "node", version: "22.3.0" },
    reporter: { name: "@dolshoe/sdk-js", version: "0.4.2" },
    mechanism: { type: "onerror", handled: false },
    trace: { traceId: TRACE_ID, spanId: "span_4f2a" },
    exception: typeError,
    user: { id: "user_8f21", username: "user_8f21" },
    tags: {
      release: "1.42.0",
      region: "ap-northeast-2",
      "checkout.flow": "express",
    },
    attributes: {
      "http.method": "POST",
      "http.route": "/api/v1/checkout",
      "cart.items": 3,
      "session.id": "sess_4f2a…",
    },
    breadcrumbs: [
      {
        timestamp: agoIso(12_400),
        category: "navigation",
        level: "info",
        message: "GET /cart → /checkout",
      },
      {
        timestamp: agoIso(3_100),
        category: "http",
        level: "info",
        message: "POST /api/v1/cart/validate 200",
        data: { status: 200, ms: 118 },
      },
      {
        timestamp: agoIso(900),
        category: "console",
        level: "warning",
        message: "payment object missing for express flow",
      },
      {
        timestamp: agoIso(200),
        category: "http",
        level: "error",
        message: "POST /api/v1/checkout 500",
        data: { status: 500 },
      },
    ],
  };
}

function loading(): ReportDetailProps {
  return {
    chrome: chrome("Report"),
    status: "loading",
  };
}

function error(): ReportDetailProps {
  return {
    chrome: chrome("Report"),
    status: "error",
    errorDescription: "The API did not return this report.",
    onRetry: () => undefined,
  };
}

function populated(): ReportDetailProps {
  const report = populatedReport();

  return {
    chrome: chrome("TypeError · #7f2a9c1e"),
    status: "ready",
    report,
    trace: { href: "#trace", label: "trace 4f2a9c1e" },
  };
}

export const reportDetailStates = {
  loading,
  error,
  populated,
} as const;

export const reportDetailStateNames = ["loading", "error", "populated"] as const;

export type ReportDetailStateName = (typeof reportDetailStateNames)[number];

export function isReportDetailStateName(value: string | null): value is ReportDetailStateName {
  return value != null && (reportDetailStateNames as readonly string[]).includes(value);
}
