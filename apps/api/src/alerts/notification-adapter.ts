import { ChannelConfig } from "./alert.contract";

const SEND_TIMEOUT_MILLISECONDS = 5_000;

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

function formatSlackText(notification: AlertNotification): string {
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

/** Delivers a firing notification to a Slack Incoming Webhook. */
export class SlackAdapter implements NotificationAdapter {
  readonly type = "slack";

  constructor(private readonly webhookUrl: string) {}

  async send(notification: AlertNotification): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: formatSlackText(notification) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MILLISECONDS),
    });

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
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(notification),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MILLISECONDS),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}.`);
    }
  }
}

export function createAdapter(config: ChannelConfig): NotificationAdapter {
  switch (config.type) {
    case "slack":
      return new SlackAdapter(config.webhookUrl);
    case "webhook":
      return new WebhookAdapter(config.url);
  }
}
