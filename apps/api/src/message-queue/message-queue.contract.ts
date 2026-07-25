export type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type MessagePayload = { readonly [key: string]: JsonValue };

export interface EnqueueMessage {
  readonly queue: string;
  readonly payload: MessagePayload;
  readonly availableAt?: Date;
  readonly deduplicationKey?: string;
}

export interface EnqueuedMessage {
  readonly id: string;
  readonly enqueuedAt: Date;
}

export interface ClaimMessages {
  readonly consumer: string;
  readonly limit?: number;
  readonly visibilityTimeoutMs?: number;
}

export interface MessageLease {
  readonly messageId: string;
  readonly token: string;
}

export interface ClaimedMessage {
  readonly id: string;
  readonly queue: string;
  readonly payload: MessagePayload;
  readonly enqueuedAt: Date;
  readonly availableAt: Date;
  readonly attempt: number;
  readonly lease: MessageLease & {
    readonly expiresAt: Date;
  };
}

export interface RetryMessage {
  readonly delayMs?: number;
  readonly reason?: string;
}

/**
 * At-least-once message delivery contract.
 *
 * A consumer must acknowledge or retry a claimed message before its lease
 * expires. Once the lease expires, another consumer may claim the message and
 * the previous lease can no longer mutate it.
 */
export abstract class MessageQueue {
  abstract enqueue(message: EnqueueMessage): Promise<EnqueuedMessage>;

  abstract claim(queue: string, options: ClaimMessages): Promise<readonly ClaimedMessage[]>;

  abstract acknowledge(lease: MessageLease): Promise<boolean>;

  abstract retry(lease: MessageLease, options?: RetryMessage): Promise<boolean>;
}
