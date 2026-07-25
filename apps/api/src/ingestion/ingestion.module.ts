import { Global, Module } from "@nestjs/common";

import { IngestAuthGuard } from "./ingest-auth.guard";

@Global()
@Module({
  providers: [IngestAuthGuard],
  exports: [IngestAuthGuard],
})
export class IngestionModule {}
