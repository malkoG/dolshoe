import { configure, dispose, getLogger } from "@logtape/logtape";
import { getDolshoeSink } from "@dolshoe/logtape";

export async function runScenario(dolshoe) {
  const reports = [];

  dolshoe.init({
    service: {
      name: "checkout-api",
      environment: "test",
      release: "2026.07.24.1",
    },
    transport: {
      async send(report) {
        reports.push(report);
      },
    },
    captureUnhandledErrors: false,
    generateEventId: () => "bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7",
  });

  await configure({
    sinks: {
      dolshoe: getDolshoeSink({ dolshoe }),
    },
    loggers: [
      {
        category: [],
        sinks: ["dolshoe"],
        lowestLevel: "error",
      },
    ],
  });

  const cause = new Error("Cart was not loaded");
  const error = new AggregateError(
    [new TypeError("Inventory is unavailable"), "payment was declined"],
    "Order submission failed",
    { cause },
  );
  const logger = getLogger(["checkout", "orders"]);

  logger.error("Order {orderId} failed", {
    orderId: "order-123",
    route: "/orders",
    retryCount: 0,
    error,
  });

  await dispose();
  const flushed = await dolshoe.flush();
  if (!flushed || reports.length !== 1) {
    throw new Error(`Expected one flushed report, received ${reports.length}.`);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(reports[0]));
}
