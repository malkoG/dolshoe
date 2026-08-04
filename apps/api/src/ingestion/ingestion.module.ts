import { Global, Module } from "@nestjs/common";

import { ProjectModule } from "../projects/project.module";
import { IngestAuthGuard } from "./ingest-auth.guard";
import { IngestReadinessService } from "./ingest-readiness.service";

@Global()
@Module({
  imports: [ProjectModule],
  providers: [IngestAuthGuard, IngestReadinessService],
  // `@UseGuards(IngestAuthGuard)` makes Nest construct the guard inside the
  // module that declares the route, so ProjectModule is re-exported here to keep
  // the guard's own dependency resolvable wherever the guard is usable.
  exports: [IngestAuthGuard, ProjectModule],
})
export class IngestionModule {}
