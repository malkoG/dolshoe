import { z } from "zod";

const contractRegistry = z.registry<{ id?: string; description?: string }>();

const nonEmptyText = (maximumLength: number) => z.string().trim().min(1).max(maximumLength);

const MAX_THRESHOLD_COUNT = 100_000;
const MAX_THRESHOLD_WINDOW_MINUTES = 24 * 60;
const MIN_COOLDOWN_MINUTES = 1;
const MAX_COOLDOWN_MINUTES = 24 * 60;
const MAX_CHANNELS = 5;

export const slackChannelConfigSchema = z
  .object({
    type: z.literal("slack"),
    webhookUrl: z.url().max(2_048).meta({ description: "A Slack Incoming Webhook URL." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "SlackChannelConfigV1",
    description: "Delivers a firing notification to a Slack Incoming Webhook.",
  });

export const webhookChannelConfigSchema = z
  .object({
    type: z.literal("webhook"),
    url: z.url().max(2_048).meta({ description: "Any URL to receive a JSON POST." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "WebhookChannelConfigV1",
    description:
      "Delivers a firing notification as an unsigned JSON POST to any URL. Signing is not part of this version.",
  });

export const channelConfigSchema = z
  .discriminatedUnion("type", [slackChannelConfigSchema, webhookChannelConfigSchema])
  .register(contractRegistry, {
    id: "ChannelConfigV1",
    description: "One delivery channel for a firing alert rule.",
  });

/**
 * Fields every condition type shares. `conditionType` and whatever fields it
 * alone needs (see `createAlertRuleRequestSchema`) are layered on top by each
 * branch of that union, so a request naming the wrong condition's fields is
 * rejected by `.strict()` rather than silently accepted and ignored.
 */
const alertRuleCommonFields = {
  name: nonEmptyText(200).meta({ description: "Human-readable name for the rule." }),
  environment: nonEmptyText(100).optional().meta({
    description: "Narrows the rule to this environment. Every report matches when omitted.",
  }),
  tagKey: nonEmptyText(200).optional().meta({
    description: "Narrows the rule to reports carrying this tag key, paired with tagValue.",
  }),
  tagValue: nonEmptyText(200).optional(),
  serviceName: nonEmptyText(200).optional().meta({
    description: "Narrows the rule to this service.",
  }),
  channels: z
    .array(channelConfigSchema)
    .min(1)
    .max(MAX_CHANNELS)
    .meta({ description: "Where a firing rule notifies. At least one, at most five." }),
  cooldownMinutes: z.int().min(MIN_COOLDOWN_MINUTES).max(MAX_COOLDOWN_MINUTES).default(30).meta({
    description:
      "How long a rule that just fired stays quiet even if it would otherwise fire again.",
  }),
};

export const createAlertRuleRequestSchema = z
  .discriminatedUnion("conditionType", [
    z
      .object({
        conditionType: z.literal("new_fingerprint").meta({
          description: "Fires the first time this project has seen a report's fingerprint.",
        }),
        ...alertRuleCommonFields,
      })
      .strict(),
    z
      .object({
        conditionType: z.literal("filter_match").meta({
          description: "Fires on every report matching the rule's filters.",
        }),
        ...alertRuleCommonFields,
      })
      .strict(),
    z
      .object({
        conditionType: z.literal("volume_threshold").meta({
          description: "Fires once matching reports in the window reach the threshold.",
        }),
        thresholdCount: z.int().positive().max(MAX_THRESHOLD_COUNT),
        thresholdWindowMinutes: z.int().positive().max(MAX_THRESHOLD_WINDOW_MINUTES),
        ...alertRuleCommonFields,
      })
      .strict(),
  ])
  .register(contractRegistry, {
    id: "CreateAlertRuleRequestV1",
    description:
      "Creates an alert rule. Only volume_threshold accepts thresholdCount/thresholdWindowMinutes; the other condition types reject them.",
  });

export const updateAlertRuleRequestSchema = z
  .object({
    name: nonEmptyText(200).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.enabled !== undefined, {
    message: "Provide a name, enabled, or both.",
  })
  .register(contractRegistry, {
    id: "UpdateAlertRuleRequestV1",
    description:
      "Renames a rule, enables/disables it, or both. Changing its condition or channels is not supported yet — delete and recreate the rule instead.",
  });

export const alertRuleSchema = z
  .object({
    id: z.uuid().meta({ description: "Server-assigned alert rule identifier." }),
    name: nonEmptyText(200),
    enabled: z.boolean(),
    conditionType: z.enum(["new_fingerprint", "volume_threshold", "filter_match"]),
    environment: z.string().optional(),
    tagKey: z.string().optional(),
    tagValue: z.string().optional(),
    serviceName: z.string().optional(),
    thresholdCount: z.int().optional(),
    thresholdWindowMinutes: z.int().optional(),
    cooldownMinutes: z.int(),
    lastFiredAt: z.iso
      .datetime()
      .nullable()
      .meta({ description: "When the rule last notified, or null if it never has." }),
    channels: z.array(channelConfigSchema),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .register(contractRegistry, {
    id: "AlertRuleV1",
    description: "A configured alert rule and its current cooldown state.",
  });

export const alertRuleListResponseSchema = z
  .object({
    rules: z.array(alertRuleSchema).meta({ description: "Newest-first alert rules." }),
  })
  .strict()
  .register(contractRegistry, {
    id: "AlertRuleListResponseV1",
    description: "A project's configured alert rules.",
  });

export const alertRuleIdParamSchema = z.uuid("An alert rule id is a UUID.");

export type SlackChannelConfig = z.infer<typeof slackChannelConfigSchema>;
export type WebhookChannelConfig = z.infer<typeof webhookChannelConfigSchema>;
export type ChannelConfig = z.infer<typeof channelConfigSchema>;
export type CreateAlertRuleRequest = z.infer<typeof createAlertRuleRequestSchema>;
export type UpdateAlertRuleRequest = z.infer<typeof updateAlertRuleRequestSchema>;
export type AlertRule = z.infer<typeof alertRuleSchema>;
export type AlertRuleListResponse = z.infer<typeof alertRuleListResponseSchema>;

function adaptJsonSchemaToOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(adaptJsonSchemaToOpenApi);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const adapted: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (key === "$id") {
      continue;
    }

    if (key === "examples" && Array.isArray(child) && child.length > 0) {
      adapted.example = adaptJsonSchemaToOpenApi(child[0]);
      continue;
    }

    adapted[key] = adaptJsonSchemaToOpenApi(child);
  }

  return adapted;
}

const generatedSchemas = z.toJSONSchema(contractRegistry, {
  target: "openapi-3.0",
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
}).schemas;

export const alertOpenApiSchemas = Object.fromEntries(
  Object.entries(generatedSchemas).map(([name, schema]) => [
    name,
    adaptJsonSchemaToOpenApi(schema),
  ]),
);
