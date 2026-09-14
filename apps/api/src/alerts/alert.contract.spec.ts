import {
  alertOpenApiSchemas,
  channelConfigSchema,
  createAlertRuleRequestSchema,
} from "./alert.contract";

const webhookChannel = { type: "webhook" as const, url: "https://example.com/hook" };

describe("alert rule channel contract", () => {
  it("accepts discord and telegram channel configs", () => {
    expect(
      channelConfigSchema.parse({
        type: "discord",
        webhookUrl: "https://discord.com/api/webhooks/1/secret",
      }),
    ).toEqual({
      type: "discord",
      webhookUrl: "https://discord.com/api/webhooks/1/secret",
    });

    expect(channelConfigSchema.parse({ type: "telegram", chatId: "-1001234567890" })).toEqual({
      type: "telegram",
      chatId: "-1001234567890",
    });
  });

  it("rejects a telegram channel that carries a bot token", () => {
    const result = channelConfigSchema.safeParse({
      type: "telegram",
      chatId: "-1001234567890",
      botToken: "123456:AAHideMe",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty telegram chat id", () => {
    expect(channelConfigSchema.safeParse({ type: "telegram", chatId: "   " }).success).toBe(false);
  });

  it("creates a rule with discord or telegram channels", () => {
    expect(
      createAlertRuleRequestSchema.parse({
        conditionType: "filter_match",
        name: "Discord",
        channels: [{ type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/secret" }],
      }).channels,
    ).toEqual([{ type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/secret" }]);

    expect(
      createAlertRuleRequestSchema.parse({
        conditionType: "filter_match",
        name: "Telegram",
        channels: [{ type: "telegram", chatId: "12345" }],
      }).channels,
    ).toEqual([{ type: "telegram", chatId: "12345" }]);
  });

  it("still accepts the existing slack and webhook channels", () => {
    expect(
      createAlertRuleRequestSchema.parse({
        conditionType: "new_fingerprint",
        name: "Existing",
        channels: [{ type: "slack", webhookUrl: "https://hooks.slack.test/x" }, webhookChannel],
      }).channels,
    ).toHaveLength(2);
  });

  it("publishes discord and telegram schemas to OpenAPI", () => {
    expect(Object.keys(alertOpenApiSchemas)).toEqual(
      expect.arrayContaining([
        "SlackChannelConfigV1",
        "WebhookChannelConfigV1",
        "DiscordChannelConfigV1",
        "TelegramChannelConfigV1",
        "ChannelConfigV1",
      ]),
    );
  });
});
