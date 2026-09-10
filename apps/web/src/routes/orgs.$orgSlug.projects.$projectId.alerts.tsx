import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { createAlertRule, deleteAlertRule, fetchAlertRules } from "../lib/alert-rules";
import { describeError } from "../lib/api-request";
import { canAdminister } from "../lib/organizations";
import { useResource } from "../lib/use-resource";
import { Alerts, toAlertRuleView, toCreateAlertRuleRequest } from "../screens/alerts/alerts";
import type { AlertRuleDraft } from "../screens/alerts/alerts";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/alerts")({
  staticData: { breadcrumb: "Alerts" },
  component: AlertsRoute,
});

function AlertsRoute() {
  const { orgSlug, projectId } = Route.useParams();
  const { organization } = Route.useRouteContext();
  const administers = canAdminister(organization.role);
  const [composing, setComposing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const { reload, state } = useResource(
    ({ signal }) => fetchAlertRules(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  const rules = state.status === "ready" ? state.data.map(toAlertRuleView) : [];
  const showForm = administers && (composing || rules.length > 0);

  async function create(draft: AlertRuleDraft): Promise<void> {
    setCreating(true);
    setFormError(undefined);
    try {
      await createAlertRule(orgSlug, projectId, toCreateAlertRuleRequest(draft));
      reload();
    } catch (cause) {
      setFormError(describeError(cause, "Something went wrong while creating the alert rule."));
    } finally {
      setCreating(false);
    }
  }

  async function remove(ruleId: string): Promise<void> {
    await deleteAlertRule(orgSlug, projectId, ruleId);
    reload();
  }

  return (
    <Alerts
      administers={administers}
      creating={creating}
      errorDescription={
        state.status === "error"
          ? describeError(state.error, "Something went wrong while loading alert rules.")
          : undefined
      }
      formError={formError}
      onCompose={() => setComposing(true)}
      onCreate={create}
      onDelete={remove}
      onRetry={reload}
      rules={rules}
      showForm={showForm}
      status={state.status}
    />
  );
}
