import { appConfig } from "../config/app-config";
import {
  AlertNotification,
  DiscordAdapter,
  SlackAdapter,
  TelegramAdapter,
  WebhookAdapter,
  createAdapter,
  redactNotificationSecrets,
} from "./notification-adapter";

const notification: AlertNotification = {
  ruleId: "rule-1",
  ruleName: "Payment failures",
  projectId: "project-1",
  projectName: "checkout-api",
  conditionSummary: "A report matched this rule's filters.",
  sampleReport: {
    id: "report-1",
    exceptionType: "TypeError",
    exceptionMessage: "cannot read property",
    occurredAt: "2026-09-14T00:00:00.000Z",
  },
  firedAt: "2026-09-14T00:00:01.000Z",
};

function jsonResponse(status: number, body: unknown = {}, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("notification adapters", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts Slack text to the webhook", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await new SlackAdapter("https://hooks.slack.test/x").send(notification);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.test/x");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      text: expect.stringContaining("Payment failures"),
    });
  });

  it("posts Discord content and honors retry_after once", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { retry_after: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await new DiscordAdapter("https://discord.com/api/webhooks/1/secret").send(notification);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body).toEqual({ content: expect.stringContaining("Payment failures") });
    expect((body.content as string).length).toBeLessThanOrEqual(2_000);
  });

  it("throws when Discord stays non-OK after the retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { retry_after: 0 }))
      .mockResolvedValueOnce(jsonResponse(500));

    await expect(
      new DiscordAdapter("https://discord.com/api/webhooks/1/secret").send(notification),
    ).rejects.toThrow("Discord webhook responded with 500.");
  });

  it("posts Telegram sendMessage without putting the token in a thrown error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const token = "123456:AAHideMeFromLogs";

    await new TelegramAdapter("-1001234567890", token).send(notification);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "-1001234567890",
      text: expect.stringContaining("Payment failures"),
    });
  });

  it("fails clearly when TELEGRAM_BOT_TOKEN is missing", async () => {
    await expect(
      new TelegramAdapter("-1001234567890", undefined).send(notification),
    ).rejects.toThrow("TELEGRAM_BOT_TOKEN is not set.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a token-free status when Telegram rejects the send", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    const token = "123456:AAHideMeFromLogs";

    await expect(new TelegramAdapter("12345", token).send(notification)).rejects.toThrow(
      "Telegram sendMessage responded with 401.",
    );
  });

  it("posts the notification object to a generic webhook", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));

    await new WebhookAdapter("https://example.com/hook").send(notification);

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual(notification);
  });

  it("wires createAdapter for each channel type", () => {
    expect(createAdapter({ type: "slack", webhookUrl: "https://hooks.slack.test/x" }).type).toBe(
      "slack",
    );
    expect(
      createAdapter({ type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/secret" })
        .type,
    ).toBe("discord");
    expect(createAdapter({ type: "telegram", chatId: "12345" }).type).toBe("telegram");
    expect(createAdapter({ type: "webhook", url: "https://example.com/hook" }).type).toBe(
      "webhook",
    );
  });

  it("reads the Telegram token from server env when created via createAdapter", async () => {
    const original = appConfig.telegramBotToken;
    Object.defineProperty(appConfig, "telegramBotToken", {
      configurable: true,
      value: "env-token",
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    try {
      await createAdapter({ type: "telegram", chatId: "99" }).send(notification);
      expect(String(fetchMock.mock.calls[0]![0])).toBe(
        "https://api.telegram.org/botenv-token/sendMessage",
      );
    } finally {
      Object.defineProperty(appConfig, "telegramBotToken", {
        configurable: true,
        value: original,
      });
    }
  });

  it("redacts webhook paths and Telegram bot tokens from log text", () => {
    expect(
      redactNotificationSecrets(
        "fetch failed https://discord.com/api/webhooks/1/super-secret bot123456:AAHideMe",
      ),
    ).toBe("fetch failed https://discord.com/api/webhooks/1/[redacted] bot[redacted]");
  });
});
