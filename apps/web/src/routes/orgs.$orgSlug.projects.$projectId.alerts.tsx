import { AttributeList, attributeEntries } from "@dolshoe/ui/components/attribute-list";
import { DataState } from "@dolshoe/ui/components/data-state";
import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
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
import { createFileRoute } from "@tanstack/react-router";
import { Bell, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ChannelConfig, ConditionType, CreateAlertRuleRequest } from "../lib/alert-rules";
import {
  createAlertRule,
  deleteAlertRule,
  fetchAlertRules,
  updateAlertRule,
} from "../lib/alert-rules";
import type { AlertRule } from "../lib/alert-rules";
import { describeError } from "../lib/api-request";
import { formatRelativeTime } from "../lib/format";
import { canAdminister } from "../lib/organizations";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/alerts")({
  component: Alerts,
});

const CONDITION_LABELS: Record<ConditionType, string> = {
  new_fingerprint: "New error",
  filter_match: "Matches filters",
  volume_threshold: "Volume threshold",
};

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

function AlertRuleRow({
  administers,
  onDelete,
  onToggle,
  rule,
}: Readonly<{
  administers: boolean;
  onDelete: (ruleId: string) => Promise<void>;
  onToggle: (ruleId: string, enabled: boolean) => Promise<void>;
  rule: AlertRule;
}>) {
  const [busy, setBusy] = useState(false);
  const filters = filterEntries(rule);

  async function toggle(): Promise<void> {
    setBusy(true);
    try {
      await onToggle(rule.id, !rule.enabled);
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      await onDelete(rule.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-[13px] font-bold">{rule.name}</strong>
        <span className="font-mono text-[10px] text-muted-foreground">
          {conditionSummary(rule)}
        </span>
        {filters.length > 0 && (
          <div className="mt-1.5">
            <AttributeList entries={filters} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-x-1.5 text-[11px] text-muted-foreground">
        <span>
          {rule.lastFiredAt == null
            ? "Never fired"
            : `Fired ${formatRelativeTime(rule.lastFiredAt)}`}
        </span>
      </div>

      {administers && (
        <div className="flex items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => void toggle()}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy && <Spinner />}
            {rule.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void remove()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
}

interface ChannelDraft {
  type: "slack" | "webhook";
  value: string;
}

function toChannelConfig(draft: ChannelDraft): ChannelConfig | undefined {
  const value = draft.value.trim();
  if (value.length === 0) return undefined;
  return draft.type === "slack"
    ? { type: "slack", webhookUrl: value }
    : { type: "webhook", url: value };
}

function CreateAlertRuleForm({
  onCreated,
  orgSlug,
  projectId,
}: Readonly<{ onCreated: () => void; orgSlug: string; projectId: string }>) {
  const [conditionType, setConditionType] = useState<ConditionType>("new_fingerprint");
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("");
  const [tagKey, setTagKey] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [thresholdCount, setThresholdCount] = useState("10");
  const [thresholdWindowMinutes, setThresholdWindowMinutes] = useState("10");
  const [channels, setChannels] = useState<ChannelDraft[]>([{ type: "slack", value: "" }]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function updateChannel(index: number, patch: Partial<ChannelDraft>): void {
    setChannels((current) =>
      current.map((channel, i) => (i === index ? { ...channel, ...patch } : channel)),
    );
  }

  function addChannel(): void {
    if (channels.length >= 5) return;
    setChannels((current) => [...current, { type: "slack", value: "" }]);
  }

  function removeChannel(index: number): void {
    setChannels((current) => current.filter((_, i) => i !== index));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (creating || name.trim().length === 0) return;

    const channelConfigs = channels
      .map(toChannelConfig)
      .filter((c): c is ChannelConfig => c != null);
    if (channelConfigs.length === 0) {
      setError("Add at least one channel.");
      return;
    }

    const common = {
      name: name.trim(),
      ...(environment.trim().length > 0 && { environment: environment.trim() }),
      ...(tagKey.trim().length > 0 &&
        tagValue.trim().length > 0 && {
          tagKey: tagKey.trim(),
          tagValue: tagValue.trim(),
        }),
      ...(serviceName.trim().length > 0 && { serviceName: serviceName.trim() }),
      channels: channelConfigs,
    };

    const request: CreateAlertRuleRequest =
      conditionType === "volume_threshold"
        ? {
            conditionType,
            ...common,
            thresholdCount: Number.parseInt(thresholdCount, 10),
            thresholdWindowMinutes: Number.parseInt(thresholdWindowMinutes, 10),
          }
        : { conditionType, ...common };

    setCreating(true);
    setError(undefined);
    try {
      await createAlertRule(orgSlug, projectId, request);
      setName("");
      setEnvironment("");
      setTagKey("");
      setTagValue("");
      setServiceName("");
      setChannels([{ type: "slack", value: "" }]);
      onCreated();
    } catch (cause) {
      setError(describeError(cause, "Something went wrong while creating the alert rule."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4 border-b border-border p-5"
      onSubmit={(event) => void submit(event)}
    >
      {error != null && (
        <p
          className="rounded-md border border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="alert-name">Name</Label>
          <Input id="alert-name" onChange={(event) => setName(event.target.value)} value={name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-condition">Condition</Label>
          <Select
            onValueChange={(value) => setConditionType(value as ConditionType)}
            value={conditionType}
          >
            <SelectTrigger className="w-[200px]" id="alert-condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new_fingerprint">New error</SelectItem>
              <SelectItem value="filter_match">Matches filters</SelectItem>
              <SelectItem value="volume_threshold">Volume threshold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {conditionType === "volume_threshold" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alert-threshold-count">Count</Label>
            <Input
              className="w-[120px]"
              id="alert-threshold-count"
              min={1}
              onChange={(event) => setThresholdCount(event.target.value)}
              type="number"
              value={thresholdCount}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="alert-threshold-window">Window (minutes)</Label>
            <Input
              className="w-[160px]"
              id="alert-threshold-window"
              min={1}
              onChange={(event) => setThresholdWindowMinutes(event.target.value)}
              type="number"
              value={thresholdWindowMinutes}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-environment">Environment</Label>
          <Input
            className="w-[180px]"
            id="alert-environment"
            onChange={(event) => setEnvironment(event.target.value)}
            placeholder="Any"
            value={environment}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-tag-key">Tag key</Label>
          <Input
            className="w-[160px]"
            id="alert-tag-key"
            onChange={(event) => setTagKey(event.target.value)}
            value={tagKey}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-tag-value">Tag value</Label>
          <Input
            className="w-[160px]"
            id="alert-tag-value"
            onChange={(event) => setTagValue(event.target.value)}
            value={tagValue}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-service">Service</Label>
          <Input
            className="w-[180px]"
            id="alert-service"
            onChange={(event) => setServiceName(event.target.value)}
            placeholder="Any"
            value={serviceName}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Channels</Label>
        {channels.map((channel, index) => (
          <div className="flex items-center gap-2" key={index}>
            <Select
              onValueChange={(value) =>
                updateChannel(index, { type: value as ChannelDraft["type"] })
              }
              value={channel.type}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="flex-1"
              onChange={(event) => updateChannel(index, { value: event.target.value })}
              placeholder={channel.type === "slack" ? "Slack webhook URL" : "Webhook URL"}
              value={channel.value}
            />
            {channels.length > 1 && (
              <Button
                onClick={() => removeChannel(index)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {channels.length < 5 && (
          <Button className="w-fit" onClick={addChannel} size="sm" type="button" variant="outline">
            <Plus />
            Add channel
          </Button>
        )}
      </div>

      <Button className="w-fit" disabled={creating} type="submit">
        {creating && <Spinner />}
        Create rule
      </Button>
    </form>
  );
}

function Alerts() {
  const { orgSlug, projectId } = Route.useParams();
  const { organization } = Route.useRouteContext();
  const administers = canAdminister(organization.role);

  const { reload, state } = useResource(
    ({ signal }) => fetchAlertRules(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  const rules = state.status === "ready" ? state.data : [];

  async function toggle(ruleId: string, enabled: boolean): Promise<void> {
    await updateAlertRule(orgSlug, projectId, ruleId, { enabled });
    reload();
  }

  async function remove(ruleId: string): Promise<void> {
    await deleteAlertRule(orgSlug, projectId, ruleId);
    reload();
  }

  return (
    <Panel>
      <PanelBar>
        <PanelSummary>{state.status === "ready" ? `${rules.length} rules` : "Alerts"}</PanelSummary>
      </PanelBar>

      {administers && (
        <CreateAlertRuleForm onCreated={reload} orgSlug={orgSlug} projectId={projectId} />
      )}

      <div aria-live="polite">
        {state.status === "loading" && (
          <DataState
            description="Fetching them from the API."
            kind="loading"
            title="Loading alert rules…"
          />
        )}

        {state.status === "error" && (
          <DataState
            description={describeError(
              state.error,
              "Something went wrong while loading alert rules.",
            )}
            kind="error"
            onRetry={reload}
            title="Couldn't load alert rules"
          />
        )}

        {state.status === "ready" && rules.length === 0 && (
          <DataState
            description={
              administers
                ? "Create one to be notified when something happens in this project."
                : "An owner or admin of this organization configures these."
            }
            icon={Bell}
            kind="empty"
            title="No alert rules yet"
          />
        )}

        {state.status === "ready" &&
          rules.map((rule) => (
            <AlertRuleRow
              administers={administers}
              key={rule.id}
              onDelete={remove}
              onToggle={toggle}
              rule={rule}
            />
          ))}
      </div>
    </Panel>
  );
}
