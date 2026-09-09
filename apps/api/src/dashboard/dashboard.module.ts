import { Module } from "@nestjs/common";

import { DashboardSummaryController } from "./dashboard-summary.controller";
import { DashboardSummaryRepository } from "./dashboard-summary.repository";
import { DashboardSummaryService } from "./dashboard-summary.service";

@Module({
  controllers: [DashboardSummaryController],
  providers: [DashboardSummaryService, DashboardSummaryRepository],
})
export class DashboardModule {}
