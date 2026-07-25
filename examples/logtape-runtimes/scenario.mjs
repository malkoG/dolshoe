import { configure, dispose, getLogger } from "@logtape/logtape";
import { getDolshoeSink } from "@dolshoe/logtape";

export async function runScenario(dolshoe) {
  const reports = [];
  const logRecords = [];
  const eventIds = ["6608e55d-1b24-4d9a-951f-7e7211f92f44", "bf695c6d-8a75-4b1d-8434-9ddb1ce54ee7"];

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
    logTransport: {
      async send(records) {
        logRecords.push(...records);
      },
    },
    captureUnhandledErrors: false,
    generateEventId: () => eventIds.shift(),
  });

  await configure({
    sinks: {
      dolshoe: getDolshoeSink({ dolshoe }),
    },
    loggers: [
      {
        category: [],
        sinks: ["dolshoe"],
        lowestLevel: "info",
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

  logger.info("Submitting order {orderId}", {
    orderId: "order-123",
    route: "/orders",
  });
  logger.error("Order {orderId} failed", {
    orderId: "order-123",
    route: "/orders",
    retryCount: 0,
    error,
  });

  await dispose();
  const flushed = await dolshoe.flush();
  if (!flushed || reports.length !== 1 || logRecords.length !== 1) {
    throw new Error(
      `Expected one report and one log record, received ${reports.length} and ${logRecords.length}.`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ report: reports[0], logRecord: logRecords[0] }));
}
