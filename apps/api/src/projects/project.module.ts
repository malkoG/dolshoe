import { Module } from "@nestjs/common";

import { ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";
import { ProjectTokenVerifier } from "./project-token.verifier";

@Module({
  controllers: [ProjectController],
  providers: [ProjectService, ProjectTokenVerifier],
  exports: [ProjectTokenVerifier],
})
export class ProjectModule {}
