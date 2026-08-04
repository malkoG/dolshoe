import { LOG_RECORD_LIST_LIMIT } from "./log-record.contract";
import { logRecordBatchExample, logRecordExample } from "./log-record.examples";
import { LogRecordRepository } from "./log-record.repository";
import { LogRecordService } from "./log-record.service";

const ORGANIZATION_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";

describe("LogRecordService", () => {
  it("stores one validated batch and returns ordered receipts", async () => {
    const receipts = [
      {
        eventId: logRecordExample.eventId,
        id: "5fa77ecf-e4fb-42a6-92bf-58a299471f35",
        receivedAt: "2026-07-25T05:30:01.450Z",
      },
    ];
    const store = jest.fn().mockResolvedValue(receipts);
    const repository = { store } as unknown as LogRecordRepository;
    const service = new LogRecordService(repository);

    await expect(service.receive(logRecordBatchExample, PROJECT_ID)).resolves.toEqual({
      records: receipts,
    });
    expect(store).toHaveBeenCalledWith(PROJECT_ID, 1, logRecordBatchExample.records);
  });

  it("reads a project's records newest-first, bounded to the documented limit", async () => {
    const listForProject = jest.fn().mockResolvedValue([
      {
        id: "5fa77ecf-e4fb-42a6-92bf-58a299471f35",
        eventId: logRecordExample.eventId,
        occurredAt: new Date("2026-07-25T05:30:00.000Z"),
        receivedAt: new Date("2026-07-25T05:30:01.450Z"),
        level: "info",
        message: "Payment authorization completed",
        category: ["checkout", "payment"],
        serviceName: "checkout-api",
        environment: "production",
        release: null,
        errorReportEventId: null,
        attributes: { paymentMethod: "card" },
      },
    ]);
    const service = new LogRecordService({ listForProject } as unknown as LogRecordRepository);

    await expect(service.list(ORGANIZATION_ID, PROJECT_ID, {})).resolves.toEqual({
      records: [
        {
          id: "5fa77ecf-e4fb-42a6-92bf-58a299471f35",
          eventId: logRecordExample.eventId,
          occurredAt: "2026-07-25T05:30:00.000Z",
          receivedAt: "2026-07-25T05:30:01.450Z",
          level: "info",
          message: "Payment authorization completed",
          category: ["checkout", "payment"],
          service: { name: "checkout-api", environment: "production" },
          errorReportEventId: null,
          attributes: { paymentMethod: "card" },
        },
      ],
    });
    expect(listForProject).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      PROJECT_ID,
      undefined,
      LOG_RECORD_LIST_LIMIT,
    );
  });

  it("passes a severity filter through to the query", async () => {
    const listForProject = jest.fn().mockResolvedValue([]);
    const service = new LogRecordService({ listForProject } as unknown as LogRecordRepository);

    await service.list(ORGANIZATION_ID, PROJECT_ID, { level: "error" });

    expect(listForProject).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      PROJECT_ID,
      "error",
      LOG_RECORD_LIST_LIMIT,
    );
  });
});
