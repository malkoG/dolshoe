import { Module } from "@nestjs/common";

import { AlertController } from "./alert.controller";
import { AlertEvaluationService } from "./alert-evaluation.service";
import { AlertRuleService } from "./alert-rule.service";

@Module({
  controllers: [AlertController],
  providers: [AlertRuleService, AlertEvaluationService],
  exports: [AlertEvaluationService],
})
export class AlertModule {}
