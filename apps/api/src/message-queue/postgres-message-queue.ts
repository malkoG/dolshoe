import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import {
  ClaimedMessage,
  ClaimMessages,
  EnqueuedMessage,
  EnqueueMessage,
  MessageLease,
  MessagePayload,
  MessageQueue,
  RetryMessage,
} from "./message-queue.contract";

const DEFAULT_CLAIM_LIMIT = 1;
const DEFAULT_VISIBILITY_TIMEOUT_MS = 30_000;
const MAX_CLAIM_LIMIT = 100;
const MAX_VISIBILITY_TIMEOUT_MS = 12 * 60 * 60 * 1_000;
const MAX_NAME_LENGTH = 200;
const MAX_RETRY_REASON_LENGTH = 65_536;

interface ClaimedMessageRow {
  id: string;
  queue: string;
  payload: MessagePayload;
  enqueuedAt: Date;
  availableAt: Date;
  attempt: number;
  leaseToken: string;
  leaseExpiresAt: Date;
}

function requireName(value: string, label: string): void {
  if (value.length === 0 || value.length > MAX_NAME_LENGTH) {
    throw new RangeError(`${label} must contain between 1 and ${MAX_NAME_LENGTH} characters.`);
  }
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function asPrismaJson(payload: MessagePayload): Prisma.InputJsonValue {
  return payload as Prisma.InputJsonValue;
}

@Injectable()
export class PostgresMessageQueue extends MessageQueue {
  constructor(private readonly database: PrismaService) {
    super();
  }

  async enqueue(message: EnqueueMessage): Promise<EnqueuedMessage> {
    requireName(message.queue, "queue");
    if (message.deduplicationKey !== undefined) {
      requireName(message.deduplicationKey, "deduplicationKey");
    }

    const data = {
      queue: message.queue,
      payload: asPrismaJson(message.payload),
      availableAt: message.availableAt,
      deduplicationKey: message.deduplicationKey,
    };
    const select = {
      id: true,
      enqueuedAt: true,
    } as const;

    if (message.deduplicationKey === undefined) {
      return this.database.queueMessage.create({ data, select });
    }

    return this.database.queueMessage.upsert({
      where: {
        queue_deduplicationKey: {
          queue: message.queue,
          deduplicationKey: message.deduplicationKey,
        },
      },
      create: data,
      update: {},
      select,
    });
  }

  async claim(queue: string, options: ClaimMessages): Promise<readonly ClaimedMessage[]> {
    requireName(queue, "queue");
    requireName(options.consumer, "consumer");

    const limit = options.limit ?? DEFAULT_CLAIM_LIMIT;
    const visibilityTimeoutMs = options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS;
    requireIntegerInRange(limit, 1, MAX_CLAIM_LIMIT, "limit");
    requireIntegerInRange(visibilityTimeoutMs, 1, MAX_VISIBILITY_TIMEOUT_MS, "visibilityTimeoutMs");

    const rows = await this.database.$queryRaw<ClaimedMessageRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "QueueMessage"
        WHERE "queue" = ${queue}
          AND "availableAt" <= CURRENT_TIMESTAMP
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= CURRENT_TIMESTAMP)
        ORDER BY "availableAt", "enqueuedAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      ),
      claimed AS (
        UPDATE "QueueMessage" AS message
        SET
          "claimedBy" = ${options.consumer},
          "leaseToken" = gen_random_uuid(),
          "leaseExpiresAt" =
            CURRENT_TIMESTAMP + (${visibilityTimeoutMs} * INTERVAL '1 millisecond'),
          "attempt" = message."attempt" + 1
        FROM candidates
        WHERE message."id" = candidates."id"
        RETURNING message.*
      )
      SELECT
        "id",
        "queue",
        "payload",
        "enqueuedAt",
        "availableAt",
        "attempt",
        "leaseToken",
        "leaseExpiresAt"
      FROM claimed
      ORDER BY "availableAt", "enqueuedAt", "id"
    `);

    return rows.map((row) => ({
      id: row.id,
      queue: row.queue,
      payload: row.payload,
      enqueuedAt: row.enqueuedAt,
      availableAt: row.availableAt,
      attempt: row.attempt,
      lease: {
        messageId: row.id,
        token: row.leaseToken,
        expiresAt: row.leaseExpiresAt,
      },
    }));
  }

  async acknowledge(lease: MessageLease): Promise<boolean> {
    const acknowledged = await this.database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      DELETE FROM "QueueMessage"
      WHERE "id" = ${lease.messageId}::uuid
        AND "leaseToken" = ${lease.token}::uuid
        AND "leaseExpiresAt" > CURRENT_TIMESTAMP
      RETURNING "id"
    `);

    return acknowledged.length === 1;
  }

  async retry(lease: MessageLease, options: RetryMessage = {}): Promise<boolean> {
    const delayMs = options.delayMs ?? 0;
    requireIntegerInRange(delayMs, 0, MAX_VISIBILITY_TIMEOUT_MS, "delayMs");
    if (options.reason !== undefined && options.reason.length > MAX_RETRY_REASON_LENGTH) {
      throw new RangeError(`reason cannot exceed ${MAX_RETRY_REASON_LENGTH} characters.`);
    }

    const retried = await this.database.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "QueueMessage"
      SET
        "availableAt" = CURRENT_TIMESTAMP + (${delayMs} * INTERVAL '1 millisecond'),
        "claimedBy" = NULL,
        "leaseToken" = NULL,
        "leaseExpiresAt" = NULL,
        "lastError" = ${options.reason ?? null}
      WHERE "id" = ${lease.messageId}::uuid
        AND "leaseToken" = ${lease.token}::uuid
        AND "leaseExpiresAt" > CURRENT_TIMESTAMP
      RETURNING "id"
    `);

    return retried.length === 1;
  }
}
