import { AttributeList, attributeEntries } from "@dolshoe/ui/components/attribute-list";
import { DataState } from "@dolshoe/ui/components/data-state";
import { ListRow, ListRowLink, ListRowMain } from "@dolshoe/ui/components/list-row";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel, PanelBar, PanelControls, PanelSummary } from "@dolshoe/ui/components/panel";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { Bell, Clock3, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import type {
  AlertRule,
  ChannelConfig,
  ConditionType,
  CreateAlertRuleRequest,
} from "../../lib/alert-rules";
import { formatRelativeTime, pluralize } from "../../lib/format";
import { ReviewChrome, projectChromeCrumbs } from "../_chrome/review-chrome";
import type { AlertsChrome } from "./chrome";

const CONDITION_LABELS: Record<ConditionType, string> = {
  new_fingerprint: "New error",
  filter_match: "Matches filters",
  volume_threshold: "Volume threshold",
};

const EMPTY_DESCRIPTION =
  "A rule watches this project for a new fingerprint, a volume threshold, or a filter match, and notifies Slack or a webhook. Cooldown stops it from firing again for 30 minutes by default.";

export interface AlertRuleView {
  id: string;
  name: string;
  enabled: boolean;
  conditionLabel: string;
  conditionType: ConditionType;
  filters: ReadonlyArray<readonly [string, string]>;
  channels: readonly string[];
  cooldownMinutes: number;
  lastFiredLabel: string;
}

export interface AlertRuleDraft {
  name: string;
  conditionType: ConditionType;
  cooldownMinutes: string;
  environment: string;
  serviceName: string;
  channelType: "slack" | "webhook";
  target: string;
  thresholdCount: string;
  thresholdWindowMinutes: string;
}

export const defaultAlertRuleDraft: AlertRuleDraft = {
  name: "",
  conditionType: "filter_match",
  cooldownMinutes: "30",
  environment: "",
  serviceName: "",
  channelType: "slack",
  target: "",
  thresholdCount: "10",
  thresholdWindowMinutes: "10",
};

export type AlertsStatus = "ready" | "loading" | "error";

export interface AlertsProps {
  administers: boolean;
  chrome?: AlertsChrome;
  creating?: boolean;
  formError?: string;
  onCompose?: () => void;
  onCreate?: (draft: AlertRuleDraft) => Promise<void> | void;
  onDelete?: (ruleId: string) => Promise<void> | void;
  onRetry?: () => void;
  rules: readonly AlertRuleView[];
  showForm?: boolean;
  status?: AlertsStatus;
  errorDescription?: string;
}

function conditionSummary(rule: AlertRule): string {
  if (rule.conditionType === "volume_threshold") {
    return `Volume ≥ ${rule.thresholdCount ?? "?"} in ${rule.thresholdWindowMinutes ?? "?"} min`;
  }
  return CONDITION_LABELS[rule.conditionType];
}

function filterEntries(rule: AlertRule): Array<[string, string]> {
  return attributeEntries({
    ...(rule.environment != null && { environment: rule.environment }),
    ...(rule.tagKey != null && rule.tagValue != null && { [rule.tagKey]: rule.tagValue }),
    ...(rule.serviceName != null && { service: rule.serviceName }),
  });
}

function formatChannel(channel: ChannelConfig): string {
  if (channel.type === "slack") return "slack";

  try {
    return `webhook ${new URL(channel.url).hostname}`;
  } catch {
    return "webhook";
  }
}

/** Maps a stored rule onto the words the public view paints. */
export function toAlertRuleView(rule: AlertRule): AlertRuleView {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    conditionLabel: conditionSummary(rule),
    conditionType: rule.conditionType,
    filters: filterEntries(rule),
    channels: rule.channels.map(formatChannel),
    cooldownMinutes: rule.cooldownMinutes,
    lastFiredLabel:
      rule.lastFiredAt == null ? "Never fired" : `Fired ${formatRelativeTime(rule.lastFiredAt)}`,
  };
}

/** Turns the form draft into the create payload the API already accepts. */
export function toCreateAlertRuleRequest(draft: AlertRuleDraft): CreateAlertRuleRequest {
  const target = draft.target.trim();
  const channels: ChannelConfig[] = [
    draft.channelType === "slack"
      ? { type: "slack", webhookUrl: target }
      : { type: "webhook", url: target },
  ];

  const common = {
    name: draft.name.trim(),
    cooldownMinutes: Number.parseInt(draft.cooldownMinutes, 10),
    ...(draft.environment.trim().length > 0 && { environment: draft.environment.trim() }),
    ...(draft.serviceName.trim().length > 0 && { serviceName: draft.serviceName.trim() }),
    channels,
  };

  if (draft.conditionType === "volume_threshold") {
    return {
      conditionType: "volume_threshold",
      ...common,
      thresholdCount: Number.parseInt(draft.thresholdCount, 10),
      thresholdWindowMinutes: Number.parseInt(draft.thresholdWindowMinutes, 10),
    };
  }

  return { conditionType: draft.conditionType, ...common };
}

function Field({
  children,
  htmlFor,
  label,
}: Readonly<{ children: ReactNode; htmlFor?: string; label: string }>) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-semibold" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function AlertRuleRow({
  administers,
  onDelete,
  rule,
}: Readonly<{
  administers: boolean;
  onDelete?: (ruleId: string) => Promise<void> | void;
  rule: AlertRuleView;
}>) {
  const [busy, setBusy] = useState(false);

  async function remove(): Promise<void> {
    if (onDelete == null || busy) return;
    setBusy(true);
    try {
      await onDelete(rule.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListRow>
      <ListRowLink className="items-start gap-4">
        <ListRowMain className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{rule.name}</p>
            <StatusBadge tone={rule.enabled ? "success" : "neutral"}>
              {rule.enabled ? "enabled" : "paused"}
            </StatusBadge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">{rule.conditionLabel}</span>
            <span className="text-faint">·</span>
            <span className="font-mono text-faint">{rule.conditionType}</span>
          </p>
          {rule.filters.length > 0 && (
            <AttributeList className="mt-1" entries={[...rule.filters]} />
          )}
        </ListRowMain>

        <div className="flex w-[220px] shrink-0 flex-col gap-1 font-mono text-xs text-muted-foreground">
          {rule.channels.map((channel) => (
            <p key={channel}>{channel}</p>
          ))}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Cooldown {rule.cooldownMinutes} min
          </p>
          <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-3.5" />
            {rule.lastFiredLabel}
          </p>
        </div>

        {administers && (
          <Button
            disabled={busy}
            onClick={() => void remove()}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy && <Spinner />}
            Delete
          </Button>
        )}
      </ListRowLink>
    </ListRow>
  );
}

function NewRuleForm({
  creating = false,
  error,
  onCreate,
}: Readonly<{
  creating?: boolean;
  error?: string;
  onCreate?: (draft: AlertRuleDraft) => Promise<void> | void;
}>) {
  const [draft, setDraft] = useState<AlertRuleDraft>(defaultAlertRuleDraft);

  function patch(update: Partial<AlertRuleDraft>): void {
    setDraft((current) => ({ ...current, ...update }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (creating || onCreate == null) return;
    await onCreate(draft);
  }

  return (
    <form className="flex flex-col gap-4 p-6" onSubmit={(event) => void submit(event)}>
      {error != null && (
        <p
          className="rounded-md border border-border bg-brand-soft px-5 py-3 text-xs font-semibold text-brand"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field htmlFor="alert-name" label="Name">
          <Input
            className="w-[320px]"
            id="alert-name"
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="Payment failures in production"
            value={draft.name}
          />
        </Field>
        <Field htmlFor="alert-condition" label="Condition">
          <Select
            onValueChange={(value) => patch({ conditionType: value as ConditionType })}
            value={draft.conditionType}
          >
            <SelectTrigger className="w-[220px]" id="alert-condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new_fingerprint">New error</SelectItem>
              <SelectItem value="filter_match">Matches filters</SelectItem>
              <SelectItem value="volume_threshold">Volume threshold</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field htmlFor="alert-cooldown" label="Cooldown">
          <Select
            onValueChange={(value) => patch({ cooldownMinutes: value })}
            value={draft.cooldownMinutes}
          >
            <SelectTrigger className="w-[140px]" id="alert-cooldown">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="60">60 minutes</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {draft.conditionType === "volume_threshold" && (
        <div className="flex flex-wrap items-end gap-3">
          <Field htmlFor="alert-threshold-count" label="Count">
            <Input
              className="w-[120px]"
              id="alert-threshold-count"
              min={1}
              onChange={(event) => patch({ thresholdCount: event.target.value })}
              type="number"
              value={draft.thresholdCount}
            />
          </Field>
          <Field htmlFor="alert-threshold-window" label="Window (minutes)">
            <Input
              className="w-[160px]"
              id="alert-threshold-window"
              min={1}
              onChange={(event) => patch({ thresholdWindowMinutes: event.target.value })}
              type="number"
              value={draft.thresholdWindowMinutes}
            />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field htmlFor="alert-environment" label="Environment">
          <Input
            className="w-[200px]"
            id="alert-environment"
            onChange={(event) => patch({ environment: event.target.value })}
            placeholder="production"
            value={draft.environment}
          />
        </Field>
        <Field htmlFor="alert-service" label="Service">
          <Input
            className="w-[200px]"
            id="alert-service"
            onChange={(event) => patch({ serviceName: event.target.value })}
            placeholder="payments"
            value={draft.serviceName}
          />
        </Field>
        <Field htmlFor="alert-channel" label="Channel">
          <Select
            onValueChange={(value) =>
              patch({ channelType: value as AlertRuleDraft["channelType"] })
            }
            value={draft.channelType}
          >
            <SelectTrigger className="w-[220px]" id="alert-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slack">Slack</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field htmlFor="alert-target" label="Target">
          <Input
            className="w-[260px]"
            id="alert-target"
            onChange={(event) => patch({ target: event.target.value })}
            placeholder={
              draft.channelType === "slack" ? "#payments-oncall" : "https://example.com/hook"
            }
            value={draft.target}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={creating} size="sm" type="submit">
          {creating && <Spinner />}
          Create rule
        </Button>
        <p className="text-xs font-medium text-faint">
          Volume threshold rules also take a count and a window (minutes).
        </p>
      </div>
    </form>
  );
}

function AlertsMain({
  administers,
  creating,
  errorDescription,
  formError,
  onCompose,
  onCreate,
  onDelete,
  onRetry,
  rules,
  showForm = false,
  status = "ready",
}: AlertsProps) {
  const summary =
    status === "ready" && rules.length > 0 ? pluralize(rules.length, "rule") : "Alerts";

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeading className="mb-0">Alerts</PageHeading>

      <Panel>
        <PanelBar>
          <PanelSummary>{summary}</PanelSummary>
          {administers && (
            <PanelControls>
              <Button onClick={onCompose} size="sm" type="button">
                <Plus className="size-3.5" />
                New rule
              </Button>
            </PanelControls>
          )}
        </PanelBar>

        <div aria-live="polite">
          {status === "loading" && (
            <DataState
              description="Fetching them from the API."
              kind="loading"
              title="Loading alert rules…"
            />
          )}

          {status === "error" && (
            <DataState
              description={errorDescription ?? "Something went wrong while loading alert rules."}
              kind="error"
              onRetry={onRetry}
              title="Couldn't load alert rules"
            />
          )}

          {status === "ready" && rules.length === 0 && (
            <DataState
              description={EMPTY_DESCRIPTION}
              icon={Bell}
              kind="empty"
              title="No alert rules yet"
            />
          )}

          {status === "ready" && rules.length > 0 && (
            <ul>
              {rules.map((rule) => (
                <AlertRuleRow
                  administers={administers}
                  key={rule.id}
                  onDelete={onDelete}
                  rule={rule}
                />
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {showForm && administers && (
        <Panel>
          <PanelBar>
            <PanelSummary>New rule</PanelSummary>
          </PanelBar>
          <NewRuleForm creating={creating} error={formError} onCreate={onCreate} />
        </Panel>
      )}
    </div>
  );
}

/**
 * The Alerts screen as Figma paints it.
 *
 * @remarks
 * `chrome` is a private stub of the project shell. The live route omits it
 * and keeps sitting in the existing `PageShell`. The silhouette factory
 * supplies the stub so a reviewer sees screen 26, not a panel on paper.
 */
export function Alerts(props: AlertsProps) {
  const body = <AlertsMain {...props} />;
  if (props.chrome == null) return body;

  return (
    <ReviewChrome
      currentProject="Alerts"
      frame="alerts"
      labels={props.chrome}
      scope="project"
      trail={projectChromeCrumbs(props.chrome, "Alerts")}
    >
      {body}
    </ReviewChrome>
  );
}
