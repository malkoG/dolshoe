import { Controller, Get } from "@nestjs/common";

import { HealthResponse, HealthService } from "./health.service";

@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
