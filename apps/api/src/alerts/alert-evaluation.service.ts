import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { isRecord } from "../error-reporting/summarize-exception";
import { Prisma } from "../generated/prisma/client";
import { ChannelConfig } from "./alert.contract";
import { AlertNotification, createAdapter } from "./notification-adapter";

/**
 * What `ErrorReportService.receive()` already has in hand right after a
 * genuinely new report is stored — not a full row re-read, since every field
 * here is one it already computed or was handed on the request.
 */
export interface EvaluableReport {
  id: string;
  fingerprint: string;
  environment: string | null;
  serviceName: string;
  tags: unknown;
  occurredAt: Date;
  exceptionType?: string;
  exceptionMessage?: string;
}

interface EnabledRuleRow {
  id: string;
  name: string;
  conditionType: string;
  environment: string | null;
  tagKey: string | null;
  tagValue: string | null;
  serviceName: string | null;
  thresholdCount: number | null;
  thresholdWindowMinutes: number | null;
  cooldownMinutes: number;
  lastFiredAt: Date | null;
  channels: Prisma.JsonValue;
}

const ENABLED_RULE_COLUMNS = {
  id: true,
  name: true,
  conditionType: true,
  environment: true,
  tagKey: true,
  tagValue: true,
  serviceName: true,
  thresholdCount: true,
  thresholdWindowMinutes: true,
  cooldownMinutes: true,
  lastFiredAt: true,
  channels: true,
} as const;

/**
 * Watches a project's incoming reports against its configured alert rules,
 * called once per genuinely new report — never for an idempotent replay,
 * which `ErrorReportService.receive()` is responsible for telling apart.
 */
@Injectable()
export class AlertEvaluationService {
  private readonly logger = new Logger(AlertEvaluationService.name);

  constructor(private readonly database: PrismaService) {}

  async evaluateForReport(projectId: string, report: EvaluableReport): Promise<void> {
    const rules = await this.database.alertRule.findMany({
      where: { projectId, enabled: true },
      select: ENABLED_RULE_COLUMNS,
    });

    if (rules.length === 0) return;

    const project = await this.database.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });

    const now = new Date();

    for (const rule of rules) {
      if (!this.matchesFilters(rule, report)) continue;
      if (!this.cooldownElapsed(rule, now)) continue;

      const shouldFire = await this.evaluateCondition(projectId, rule, report);
      if (!shouldFire) continue;

      await this.database.alertRule.update({
        where: { id: rule.id },
        data: { lastFiredAt: now },
      });

      this.notify(rule, projectId, project.name, report, now);
    }
  }

  /** Every set filter is an AND; a rule with none set matches every report. */
  private matchesFilters(rule: EnabledRuleRow, report: EvaluableReport): boolean {
    if (rule.environment != null && rule.environment !== report.environment) return false;
    if (rule.serviceName != null && rule.serviceName !== report.serviceName) return false;

    if (rule.tagKey != null) {
      if (!isRecord(report.tags)) return false;
      if (report.tags[rule.tagKey] !== rule.tagValue) return false;
    }

    return true;
  }

  private cooldownElapsed(rule: EnabledRuleRow, now: Date): boolean {
    if (rule.lastFiredAt == null) return true;
    const elapsedMinutes = (now.getTime() - rule.lastFiredAt.getTime()) / 60_000;
    return elapsedMinutes >= rule.cooldownMinutes;
  }

  private async evaluateCondition(
    projectId: string,
    rule: EnabledRuleRow,
    report: EvaluableReport,
  ): Promise<boolean> {
    switch (rule.conditionType) {
      case "filter_match":
        return true;

      case "new_fingerprint": {
        const priorCount = await this.database.errorReport.count({
          where: { projectId, fingerprint: report.fingerprint, id: { not: report.id } },
        });
        return priorCount === 0;
      }

      case "volume_threshold": {
        if (rule.thresholdCount == null || rule.thresholdWindowMinutes == null) return false;

        const since = new Date(Date.now() - rule.thresholdWindowMinutes * 60_000);
        const count = await this.database.errorReport.count({
          where: {
            projectId,
            receivedAt: { gte: since },
            ...(rule.environment != null && { environment: rule.environment }),
            ...(rule.serviceName != null && { serviceName: rule.serviceName }),
            ...(rule.tagKey != null &&
              rule.tagValue != null && {
                tags: { path: [rule.tagKey], equals: rule.tagValue },
              }),
          },
        });
        return count >= rule.thresholdCount;
      }

      default:
        return false;
    }
  }

  private conditionSummary(rule: EnabledRuleRow): string {
    switch (rule.conditionType) {
      case "new_fingerprint":
        return "This is the first time this project has seen a report with this fingerprint.";
      case "volume_threshold":
        return `Matching reports reached ${String(rule.thresholdCount)} within the last ${String(rule.thresholdWindowMinutes)} minutes.`;
      case "filter_match":
        return "A report matched this rule's filters.";
      default:
        return "The rule's condition was met.";
    }
  }

  private notify(
    rule: EnabledRuleRow,
    projectId: string,
    projectName: string,
    report: EvaluableReport,
    firedAt: Date,
  ): void {
    const notification: AlertNotification = {
      ruleId: rule.id,
      ruleName: rule.name,
      projectId,
      projectName,
      conditionSummary: this.conditionSummary(rule),
      sampleReport: {
        id: report.id,
        exceptionType: report.exceptionType,
        exceptionMessage: report.exceptionMessage,
        occurredAt: report.occurredAt.toISOString(),
      },
      firedAt: firedAt.toISOString(),
    };

    const channels = Array.isArray(rule.channels) ? (rule.channels as ChannelConfig[]) : [];

    for (const channelConfig of channels) {
      const adapter = createAdapter(channelConfig);
      adapter.send(notification).catch((error: unknown) => {
        this.logger.warn(
          `Alert rule ${rule.id} (${rule.name}) failed to notify its ${adapter.type} channel: ${String(error)}`,
        );
      });
    }
  }
}
