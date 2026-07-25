import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { PrismaService } from "../src/database/prisma.service";
import { MessageQueue } from "../src/message-queue/message-queue.contract";
import { MessageQueueModule } from "../src/message-queue/message-queue.module";

describe("PostgreSQL message queue", () => {
  let app: INestApplication;
  let database: PrismaService;
  let messageQueue: MessageQueue;
  const testQueues = new Set<string>();

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      imports: [MessageQueueModule],
    }).compile();

    app = moduleReference.createNestApplication();
    await app.init();
    database = app.get(PrismaService);
    messageQueue = app.get(MessageQueue);
  });

  afterEach(async () => {
    await database.queueMessage.deleteMany({
      where: {
        queue: {
          in: [...testQueues],
        },
      },
    });
    testQueues.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  function queueName(): string {
    const queue = `test.${randomUUID()}`;
    testQueues.add(queue);
    return queue;
  }

  it("deduplicates, leases, and acknowledges a message", async () => {
    const queue = queueName();
    const deduplicationKey = randomUUID();
    const first = await messageQueue.enqueue({
      queue,
      deduplicationKey,
      payload: { reportId: randomUUID() },
    });
    const duplicate = await messageQueue.enqueue({
      queue,
      deduplicationKey,
      payload: { reportId: randomUUID() },
    });

    expect(duplicate).toEqual(first);

    const [claimed] = await messageQueue.claim(queue, {
      consumer: "worker-1",
      visibilityTimeoutMs: 60_000,
    });
    expect(claimed).toMatchObject({
      id: first.id,
      attempt: 1,
    });
    await expect(
      messageQueue.claim(queue, {
        consumer: "worker-2",
      }),
    ).resolves.toEqual([]);

    await expect(messageQueue.acknowledge(claimed!.lease)).resolves.toBe(true);
    await expect(messageQueue.acknowledge(claimed!.lease)).resolves.toBe(false);
    await expect(
      database.queueMessage.count({
        where: { queue },
      }),
    ).resolves.toBe(0);
  });

  it("retries a failed delivery and rejects the stale lease", async () => {
    const queue = queueName();
    await messageQueue.enqueue({
      queue,
      payload: { reportId: randomUUID() },
    });
    const [firstClaim] = await messageQueue.claim(queue, {
      consumer: "worker-1",
    });

    await expect(
      messageQueue.retry(firstClaim!.lease, {
        reason: "index temporarily unavailable",
      }),
    ).resolves.toBe(true);

    const [secondClaim] = await messageQueue.claim(queue, {
      consumer: "worker-2",
    });
    expect(secondClaim).toMatchObject({
      attempt: 2,
    });
    expect(secondClaim!.lease.token).not.toBe(firstClaim!.lease.token);
    await expect(messageQueue.acknowledge(firstClaim!.lease)).resolves.toBe(false);

    const stored = await database.queueMessage.findUniqueOrThrow({
      where: { id: secondClaim!.id },
    });
    expect(stored.lastError).toBe("index temporarily unavailable");
    await expect(messageQueue.acknowledge(secondClaim!.lease)).resolves.toBe(true);
  });

  it("allows another consumer to reclaim an expired lease", async () => {
    const queue = queueName();
    const enqueued = await messageQueue.enqueue({
      queue,
      payload: { reportId: randomUUID() },
    });
    const [expiredClaim] = await messageQueue.claim(queue, {
      consumer: "worker-1",
    });
    await database.queueMessage.update({
      where: { id: enqueued.id },
      data: {
        leaseExpiresAt: new Date("2000-01-01T00:00:00.000Z"),
      },
    });

    const [reclaimed] = await messageQueue.claim(queue, {
      consumer: "worker-2",
    });
    expect(reclaimed).toMatchObject({
      id: enqueued.id,
      attempt: 2,
    });
    await expect(messageQueue.acknowledge(expiredClaim!.lease)).resolves.toBe(false);
    await expect(messageQueue.acknowledge(reclaimed!.lease)).resolves.toBe(true);
  });
});
