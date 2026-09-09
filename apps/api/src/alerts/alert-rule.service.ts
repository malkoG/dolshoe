import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import {
  AlertRule,
  AlertRuleListResponse,
  ChannelConfig,
  CreateAlertRuleRequest,
  UpdateAlertRuleRequest,
} from "./alert.contract";

function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const ALERT_RULE_COLUMNS = {
  id: true,
  name: true,
  enabled: true,
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
  createdAt: true,
} as const;

interface AlertRuleRow {
  id: string;
  name: string;
  enabled: boolean;
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
  createdAt: Date;
}

function toAlertRule(row: AlertRuleRow): AlertRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    conditionType: row.conditionType as AlertRule["conditionType"],
    environment: row.environment ?? undefined,
    tagKey: row.tagKey ?? undefined,
    tagValue: row.tagValue ?? undefined,
    serviceName: row.serviceName ?? undefined,
    thresholdCount: row.thresholdCount ?? undefined,
    thresholdWindowMinutes: row.thresholdWindowMinutes ?? undefined,
    cooldownMinutes: row.cooldownMinutes,
    lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
    channels: (row.channels ?? []) as ChannelConfig[],
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AlertRuleService {
  constructor(private readonly database: PrismaService) {}

  async create(
    organizationId: string,
    projectId: string,
    request: CreateAlertRuleRequest,
  ): Promise<AlertRule> {
    await this.requireProject(organizationId, projectId);

    const created = await this.database.alertRule.create({
      data: {
        projectId,
        name: request.name,
        conditionType: request.conditionType,
        environment: request.environment,
        tagKey: request.tagKey,
        tagValue: request.tagValue,
        serviceName: request.serviceName,
        thresholdCount:
          request.conditionType === "volume_threshold" ? request.thresholdCount : undefined,
        thresholdWindowMinutes:
          request.conditionType === "volume_threshold" ? request.thresholdWindowMinutes : undefined,
        cooldownMinutes: request.cooldownMinutes,
        channels: asPrismaJson(request.channels),
      },
      select: ALERT_RULE_COLUMNS,
    });

    return toAlertRule(created);
  }

  async list(organizationId: string, projectId: string): Promise<AlertRuleListResponse> {
    await this.requireProject(organizationId, projectId);

    const rows = await this.database.alertRule.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: ALERT_RULE_COLUMNS,
    });

    return { rules: rows.map(toAlertRule) };
  }

  async update(
    organizationId: string,
    projectId: string,
    ruleId: string,
    request: UpdateAlertRuleRequest,
  ): Promise<AlertRule> {
    await this.requireRule(organizationId, projectId, ruleId);

    const updated = await this.database.alertRule.update({
      where: { id: ruleId },
      data: {
        ...(request.name !== undefined && { name: request.name }),
        ...(request.enabled !== undefined && { enabled: request.enabled }),
      },
      select: ALERT_RULE_COLUMNS,
    });

    return toAlertRule(updated);
  }

  async delete(organizationId: string, projectId: string, ruleId: string): Promise<void> {
    await this.requireRule(organizationId, projectId, ruleId);
    await this.database.alertRule.delete({ where: { id: ruleId } });
  }

  /**
   * Both halves of the scope are required, the same reason every other
   * project-scoped service checks both: a project id guessed from another
   * tenant matches nothing here rather than relying on a check further up.
   */
  private async requireProject(organizationId: string, projectId: string): Promise<void> {
    const project = await this.database.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });

    if (project == null) {
      throw new NotFoundException(`No project exists with the id ${projectId}.`);
    }
  }

  private async requireRule(
    organizationId: string,
    projectId: string,
    ruleId: string,
  ): Promise<void> {
    const rule = await this.database.alertRule.findFirst({
      where: { id: ruleId, projectId, project: { organizationId } },
      select: { id: true },
    });

    if (rule == null) {
      throw new NotFoundException(`No alert rule exists with the id ${ruleId}.`);
    }
  }
}
