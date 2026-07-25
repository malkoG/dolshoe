import { PrismaService } from "../database/prisma.service";
import { MessageQueue } from "./message-queue.contract";
import { PostgresMessageQueue } from "./postgres-message-queue";

function createDatabaseMock() {
  return {
    queueMessage: {
      create: jest.fn(),
      upsert: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
}

describe("PostgresMessageQueue", () => {
  it("implements the message queue contract and enqueues a message", async () => {
    const database = createDatabaseMock();
    database.queueMessage.create.mockResolvedValue({
      id: "b7be5144-6424-4c69-b185-6f5d65f6a26a",
      enqueuedAt: new Date("2026-07-25T01:00:00.000Z"),
    });
    const queue: MessageQueue = new PostgresMessageQueue(database as unknown as PrismaService);

    await expect(
      queue.enqueue({
        queue: "error-report.received",
        payload: {
          reportId: "98b68f4a-7c21-44d1-a476-30a474e08612",
        },
      }),
    ).resolves.toEqual({
      id: "b7be5144-6424-4c69-b185-6f5d65f6a26a",
      enqueuedAt: new Date("2026-07-25T01:00:00.000Z"),
    });
    expect(database.queueMessage.create).toHaveBeenCalledWith({
      data: {
        queue: "error-report.received",
        payload: {
          reportId: "98b68f4a-7c21-44d1-a476-30a474e08612",
        },
      },
      select: {
        id: true,
        enqueuedAt: true,
      },
    });
  });

  it("uses the queue-scoped deduplication key for idempotent enqueueing", async () => {
    const database = createDatabaseMock();
    database.queueMessage.upsert.mockResolvedValue({
      id: "b7be5144-6424-4c69-b185-6f5d65f6a26a",
      enqueuedAt: new Date("2026-07-25T01:00:00.000Z"),
    });
    const queue = new PostgresMessageQueue(database as unknown as PrismaService);

    await queue.enqueue({
      queue: "error-report.received",
      deduplicationKey: "98b68f4a-7c21-44d1-a476-30a474e08612",
      payload: {
        reportId: "98b68f4a-7c21-44d1-a476-30a474e08612",
      },
    });

    expect(database.queueMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          queue_deduplicationKey: {
            queue: "error-report.received",
            deduplicationKey: "98b68f4a-7c21-44d1-a476-30a474e08612",
          },
        },
        update: {},
      }),
    );
  });

  it("maps a PostgreSQL lease to the contract", async () => {
    const database = createDatabaseMock();
    database.$queryRaw.mockResolvedValue([
      {
        id: "b7be5144-6424-4c69-b185-6f5d65f6a26a",
        queue: "error-report.received",
        payload: {
          reportId: "98b68f4a-7c21-44d1-a476-30a474e08612",
        },
        enqueuedAt: new Date("2026-07-25T01:00:00.000Z"),
        availableAt: new Date("2026-07-25T01:00:00.000Z"),
        attempt: 2,
        leaseToken: "d56453e0-7778-4c91-b193-a190c75e8d65",
        leaseExpiresAt: new Date("2026-07-25T01:00:30.000Z"),
      },
    ]);
    const queue = new PostgresMessageQueue(database as unknown as PrismaService);

    await expect(
      queue.claim("error-report.received", {
        consumer: "error-report-indexer-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "b7be5144-6424-4c69-b185-6f5d65f6a26a",
        attempt: 2,
        lease: {
          messageId: "b7be5144-6424-4c69-b185-6f5d65f6a26a",
          token: "d56453e0-7778-4c91-b193-a190c75e8d65",
          expiresAt: new Date("2026-07-25T01:00:30.000Z"),
        },
      }),
    ]);
  });

  it("reports whether acknowledge and retry still own the active lease", async () => {
    const database = createDatabaseMock();
    database.$queryRaw
      .mockResolvedValueOnce([{ id: "b7be5144-6424-4c69-b185-6f5d65f6a26a" }])
      .mockResolvedValueOnce([]);
    const queue = new PostgresMessageQueue(database as unknown as PrismaService);
    const lease = {
      messageId: "b7be5144-6424-4c69-b185-6f5d65f6a26a",
      token: "d56453e0-7778-4c91-b193-a190c75e8d65",
    };

    await expect(queue.acknowledge(lease)).resolves.toBe(true);
    await expect(queue.retry(lease, { reason: "temporary failure" })).resolves.toBe(false);
  });

  it("rejects invalid claim limits before querying PostgreSQL", async () => {
    const database = createDatabaseMock();
    const queue = new PostgresMessageQueue(database as unknown as PrismaService);

    await expect(
      queue.claim("error-report.received", {
        consumer: "error-report-indexer-1",
        limit: 0,
      }),
    ).rejects.toThrow("limit must be an integer between 1 and 100.");
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });
});
