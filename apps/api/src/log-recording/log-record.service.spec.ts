import { logRecordBatchExample, logRecordExample } from "./log-record.examples";
import { LogRecordRepository } from "./log-record.repository";
import { LogRecordService } from "./log-record.service";

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

    await expect(service.receive(logRecordBatchExample)).resolves.toEqual({
      records: receipts,
    });
    expect(store).toHaveBeenCalledWith(1, logRecordBatchExample.records);
  });
});
