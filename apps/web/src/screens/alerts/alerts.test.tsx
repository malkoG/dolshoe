import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { AlertRule } from "../../lib/alert-rules";
import {
  Alerts,
  channelTargetCopy,
  defaultAlertRuleDraft,
  toAlertRuleView,
  toCreateAlertRuleRequest,
} from "./alerts";
import { alertsStateNames, alertsStates } from "./alerts.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the screen drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("Alerts named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(alertsStates)).toEqual([...alertsStateNames]);
  });

  test("empty explains what a rule watches and hides the create form", () => {
    render(<Alerts {...alertsStates.empty()} />);

    expect(screen.getByRole("heading", { name: "Alerts" })).toBeTruthy();
    expect(screen.getByText("No alert rules yet")).toBeTruthy();
    expect(screen.getByText(/notifies Slack, Discord, Telegram, or a webhook/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "New rule" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create rule" })).toBeNull();
    expect(screen.queryByText("Any new error")).toBeNull();
  });

  test("populated lists the three rules and the create form", () => {
    render(<Alerts {...alertsStates.populated()} />);

    expect(screen.getByText("3 rules")).toBeTruthy();
    expect(screen.getByText("Any new error")).toBeTruthy();
    expect(screen.getByText("new_fingerprint")).toBeTruthy();
    expect(screen.getByText("slack #checkout-alerts")).toBeTruthy();
    expect(screen.getByText("Payment failures in production")).toBeTruthy();
    expect(screen.getByText("filter_match")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
    expect(screen.getByText("Error spike")).toBeTruthy();
    expect(screen.getByText("paused")).toBeTruthy();
    expect(screen.getByText("volume_threshold")).toBeTruthy();
    expect(screen.getByText("Create rule")).toBeTruthy();
    expect(screen.getByText(/Volume threshold rules also take a count/)).toBeTruthy();
    expect(screen.getByRole("option", { name: "Slack" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Discord" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Telegram" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Webhook" })).toBeTruthy();
  });
});

const storedRule: AlertRule = {
  id: "rule-1",
  name: "Payment failures",
  enabled: true,
  conditionType: "filter_match",
  cooldownMinutes: 30,
  lastFiredAt: null,
  channels: [],
  createdAt: "2026-09-14T00:00:00.000Z",
};

describe("Alerts channel mapping", () => {
  test("target copy matches the designer lock", () => {
    expect(channelTargetCopy("slack")).toEqual({ placeholder: "#payments-oncall" });
    expect(channelTargetCopy("discord")).toEqual({
      placeholder: "https://discord.com/api/webhooks/…",
      helper: "Incoming Webhook URL",
    });
    expect(channelTargetCopy("telegram")).toEqual({
      placeholder: "-1001234567890",
      helper: "Chat ID. Bot token is server env",
    });
    expect(channelTargetCopy("webhook")).toEqual({ placeholder: "https://example.com/hook" });
  });

  test("create payload uses webhookUrl, chatId, or url by channel", () => {
    expect(
      toCreateAlertRuleRequest({
        ...defaultAlertRuleDraft,
        name: "Slack",
        channelType: "slack",
        target: "https://hooks.slack.test/x",
      }).channels,
    ).toEqual([{ type: "slack", webhookUrl: "https://hooks.slack.test/x" }]);

    expect(
      toCreateAlertRuleRequest({
        ...defaultAlertRuleDraft,
        name: "Discord",
        channelType: "discord",
        target: "https://discord.com/api/webhooks/1/secret",
      }).channels,
    ).toEqual([{ type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/secret" }]);

    expect(
      toCreateAlertRuleRequest({
        ...defaultAlertRuleDraft,
        name: "Telegram",
        channelType: "telegram",
        target: "-1001234567890",
      }).channels,
    ).toEqual([{ type: "telegram", chatId: "-1001234567890" }]);

    expect(
      toCreateAlertRuleRequest({
        ...defaultAlertRuleDraft,
        name: "Hook",
        channelType: "webhook",
        target: "https://example.com/hook",
      }).channels,
    ).toEqual([{ type: "webhook", url: "https://example.com/hook" }]);
  });

  test("formatChannel names discord and telegram without a bot token", () => {
    expect(
      toAlertRuleView({
        ...storedRule,
        channels: [{ type: "discord", webhookUrl: "https://discord.com/api/webhooks/1/secret" }],
      }).channels,
    ).toEqual(["discord"]);

    const telegram = toAlertRuleView({
      ...storedRule,
      channels: [{ type: "telegram", chatId: "-1001234567890" }],
    });
    expect(telegram.channels).toEqual(["telegram -1001234567890"]);
    expect(JSON.stringify(telegram)).not.toMatch(/token|123456:AA/i);
  });
});
