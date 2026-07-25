import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { MessageQueue } from "./message-queue.contract";
import { PostgresMessageQueue } from "./postgres-message-queue";

@Module({
  imports: [DatabaseModule],
  providers: [
    PostgresMessageQueue,
    {
      provide: MessageQueue,
      useExisting: PostgresMessageQueue,
    },
  ],
  exports: [MessageQueue],
})
export class MessageQueueModule {}
