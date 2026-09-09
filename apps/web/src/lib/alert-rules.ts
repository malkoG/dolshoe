import { z } from "zod";

import { ApiError, jsonBody, requestJson } from "./api-request";

function alertRulesUrl(orgSlug: string, projectId: string): string {
  return `/api/v1/orgs/${orgSlug}/projects/${projectId}/alert-rules`;
}

const slackChannelConfigSchema = z.object({
  type: z.literal("slack"),
  webhookUrl: z.string(),
});

const webhookChannelConfigSchema = z.object({
  type: z.literal("webhook"),
  url: z.string(),
});

const channelConfigSchema = z.discriminatedUnion("type", [
  slackChannelConfigSchema,
  webhookChannelConfigSchema,
]);

const conditionTypeSchema = z.enum(["new_fingerprint", "volume_threshold", "filter_match"]);

const alertRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  conditionType: conditionTypeSchema,
  environment: z.string().optional(),
  tagKey: z.string().optional(),
  tagValue: z.string().optional(),
  serviceName: z.string().optional(),
  thresholdCount: z.number().int().optional(),
  thresholdWindowMinutes: z.number().int().optional(),
  cooldownMinutes: z.number().int(),
  lastFiredAt: z.string().nullable(),
  channels: z.array(channelConfigSchema),
  createdAt: z.string(),
});

const alertRuleListResponseSchema = z.object({
  rules: z.array(alertRuleSchema),
});

export type ConditionType = z.infer<typeof conditionTypeSchema>;
export type ChannelConfig = z.infer<typeof channelConfigSchema>;
export type AlertRule = z.infer<typeof alertRuleSchema>;

/**
 * The three shapes `createAlertRule` accepts, mirroring the API's
 * discriminated union: only `volume_threshold` carries threshold fields, and
 * the other two reject them.
 */
export type CreateAlertRuleRequest =
  | {
      conditionType: "new_fingerprint" | "filter_match";
      name: string;
      environment?: string;
      tagKey?: string;
      tagValue?: string;
      serviceName?: string;
      channels: ChannelConfig[];
      cooldownMinutes?: number;
    }
  | {
      conditionType: "volume_threshold";
      name: string;
      thresholdCount: number;
      thresholdWindowMinutes: number;
      environment?: string;
      tagKey?: string;
      tagValue?: string;
      serviceName?: string;
      channels: ChannelConfig[];
      cooldownMinutes?: number;
    };

export interface UpdateAlertRuleRequest {
  name?: string;
  enabled?: boolean;
}

export async function fetchAlertRules(
  orgSlug: string,
  projectId: string,
  init?: { signal?: AbortSignal },
): Promise<AlertRule[]> {
  const { rules } = await requestJson(
    "list alert rules",
    alertRulesUrl(orgSlug, projectId),
    alertRuleListResponseSchema,
    init,
  );
  return rules;
}

export function createAlertRule(
  orgSlug: string,
  projectId: string,
  input: CreateAlertRuleRequest,
  init?: { signal?: AbortSignal },
): Promise<AlertRule> {
  return requestJson("create the alert rule", alertRulesUrl(orgSlug, projectId), alertRuleSchema, {
    ...jsonBody(input),
    ...init,
  });
}

export function updateAlertRule(
  orgSlug: string,
  projectId: string,
  ruleId: string,
  input: UpdateAlertRuleRequest,
  init?: { signal?: AbortSignal },
): Promise<AlertRule> {
  return requestJson(
    "update the alert rule",
    `${alertRulesUrl(orgSlug, projectId)}/${ruleId}`,
    alertRuleSchema,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      ...init,
    },
  );
}

/** Answers 204 with no body, so there is nothing for `requestJson` to validate. */
export async function deleteAlertRule(
  orgSlug: string,
  projectId: string,
  ruleId: string,
  init?: { signal?: AbortSignal },
): Promise<void> {
  const url = `${alertRulesUrl(orgSlug, projectId)}/${ruleId}`;
  const response = await fetch(url, { method: "DELETE", ...init });

  if (!response.ok) {
    throw new ApiError(
      `Could not delete the alert rule: the API responded with ${response.status}.`,
      {
        operation: "delete the alert rule",
        url,
        status: response.status,
      },
    );
  }
}
