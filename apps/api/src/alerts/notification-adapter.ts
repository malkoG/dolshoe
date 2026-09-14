import { appConfig } from "../config/app-config";
import { ChannelConfig } from "./alert.contract";

const SEND_TIMEOUT_MILLISECONDS = 5_000;
const DISCORD_CONTENT_MAX_LENGTH = 2_000;
const TELEGRAM_TEXT_MAX_LENGTH = 4_096;

/**
 * What a firing rule tells a channel. Assembled once by the evaluation
 * service and handed unchanged to whichever adapters the rule configures.
 */
export interface AlertNotification {
  ruleId: string;
  ruleName: string;
  projectId: string;
  projectName: string;
  conditionSummary: string;
  sampleReport?: {
    id: string;
    exceptionType?: string;
    exceptionMessage?: string;
    occurredAt: string;
  };
  firedAt: string;
}

export interface NotificationAdapter {
  readonly type: string;
  send(notification: AlertNotification): Promise<void>;
}

function formatNotificationText(notification: AlertNotification): string {
  const lines = [
    `*${notification.ruleName}* fired for _${notification.projectName}_`,
    notification.conditionSummary,
  ];

  const sample = notification.sampleReport;
  if (sample != null && (sample.exceptionType != null || sample.exceptionMessage != null)) {
    lines.push(`\`${sample.exceptionType ?? "Error"}\`: ${sample.exceptionMessage ?? ""}`.trim());
  }

  return lines.join("\n");
}

function truncate(text: string, maximumLength: number): string {
  if (text.length <= maximumLength) return text;
  return `${text.slice(0, maximumLength - 1)}…`;
}

function formatSlackText(notification: AlertNotification): string {
  return formatNotificationText(notification);
}

/**
 * Strips webhook URLs and Telegram bot tokens out of a delivery error so a
 * warn line cannot echo a secret the adapter URL or fetch stack still held.
 */
export function redactNotificationSecrets(error: unknown): string {
  return String(error)
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]")
    .replace(/https?:\/\/[^\s)'"]+/g, (url) => {
      try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
        if (segments.length >= 3) {
          parsed.pathname = `/${segments.slice(0, 2).join("/")}/[redacted]`;
        }
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return "[redacted-url]";
      }
    });
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MILLISECONDS),
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function discordRetryAfterMilliseconds(response: Response): Promise<number> {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload != null &&
      "retry_after" in payload &&
      typeof payload.retry_after === "number" &&
      Number.isFinite(payload.retry_after)
    ) {
      return Math.min(Math.max(payload.retry_after * 1_000, 0), SEND_TIMEOUT_MILLISECONDS);
    }
  } catch {
    // Fall through to the header, then a short default.
  }

  const header = response.headers.get("retry-after");
  if (header != null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, SEND_TIMEOUT_MILLISECONDS);
    }
  }

  return 1_000;
}

/** Delivers a firing notification to a Slack Incoming Webhook. */
export class SlackAdapter implements NotificationAdapter {
  readonly type = "slack";

  constructor(private readonly webhookUrl: string) {}

  async send(notification: AlertNotification): Promise<void> {
    const response = await postJson(this.webhookUrl, { text: formatSlackText(notification) });

    if (!response.ok) {
      throw new Error(`Slack webhook responded with ${response.status}.`);
    }
  }
}

/**
 * Delivers a firing notification as an unsigned JSON POST to any URL.
 *
 * @remarks
 * Unsigned deliberately — see `webhookChannelConfigSchema`'s own doc comment.
 * A receiver has only the payload's shape to trust today.
 */
export class WebhookAdapter implements NotificationAdapter {
  readonly type = "webhook";

  constructor(private readonly url: string) {}

  async send(notification: AlertNotification): Promise<void> {
    const response = await postJson(this.url, notification);

    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}.`);
    }
  }
}

/** Delivers a firing notification to a Discord Incoming Webhook. */
export class DiscordAdapter implements NotificationAdapter {
  readonly type = "discord";

  constructor(private readonly webhookUrl: string) {}

  async send(notification: AlertNotification): Promise<void> {
    const body = {
      content: truncate(formatNotificationText(notification), DISCORD_CONTENT_MAX_LENGTH),
    };
    const response = await postJson(this.webhookUrl, body);

    if (response.status === 429) {
      await delay(await discordRetryAfterMilliseconds(response));
      const retried = await postJson(this.webhookUrl, body);
      if (!retried.ok) {
        throw new Error(`Discord webhook responded with ${retried.status}.`);
      }
      return;
    }

    if (!response.ok) {
      throw new Error(`Discord webhook responded with ${response.status}.`);
    }
  }
}

/**
 * Delivers a firing notification via Telegram Bot API `sendMessage`.
 *
 * The chat id is on the rule; the bot token is server environment and is
 * never stored with the channel config.
 */
export class TelegramAdapter implements NotificationAdapter {
  readonly type = "telegram";

  constructor(
    private readonly chatId: string,
    private readonly botToken: string | undefined,
  ) {}

  async send(notification: AlertNotification): Promise<void> {
    if (this.botToken == null || this.botToken.length === 0) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set.");
    }

    const response = await postJson(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      chat_id: this.chatId,
      text: truncate(formatNotificationText(notification), TELEGRAM_TEXT_MAX_LENGTH),
    });

    if (!response.ok) {
      throw new Error(`Telegram sendMessage responded with ${response.status}.`);
    }
  }
}

export function createAdapter(config: ChannelConfig): NotificationAdapter {
  switch (config.type) {
    case "slack":
      return new SlackAdapter(config.webhookUrl);
    case "webhook":
      return new WebhookAdapter(config.url);
    case "discord":
      return new DiscordAdapter(config.webhookUrl);
    case "telegram":
      return new TelegramAdapter(config.chatId, appConfig.telegramBotToken);
  }
}
