import type { AlertsChrome } from "./chrome";
import type { AlertRuleView, AlertsProps } from "./alerts";

/**
 * Named states for the Alerts screen.
 *
 * @remarks
 * The two Figma frames are the ones that change the silhouette: an empty
 * project, and three rules plus the create form. Loading and error stay on
 * the route; inventing goldens for them would photograph a panel the board
 * never drew.
 */
const chrome: AlertsChrome = {
  orgInitial: "A",
  orgName: "Acme Payments",
  projectInitial: "C",
  projectName: "checkout-api",
  viewerHandle: "@kodingwarrior",
  viewerInitials: "KW",
  viewerName: "Koding Warrior",
};

function empty(): AlertsProps {
  return {
    administers: true,
    chrome,
    rules: [],
    showForm: false,
    status: "ready",
  };
}

function populated(): AlertsProps {
  const rules: AlertRuleView[] = [
    {
      id: "any-new-error",
      name: "Any new error",
      enabled: true,
      conditionLabel: "New error",
      conditionType: "new_fingerprint",
      filters: [],
      channels: ["slack #checkout-alerts"],
      cooldownMinutes: 30,
      lastFiredLabel: "Fired 2 hours ago",
    },
    {
      id: "payment-failures",
      name: "Payment failures in production",
      enabled: true,
      conditionLabel: "Matches filters",
      conditionType: "filter_match",
      filters: [
        ["environment", "production"],
        ["service", "payments"],
      ],
      channels: ["slack #payments-oncall", "webhook pagerduty"],
      cooldownMinutes: 15,
      lastFiredLabel: "Never fired",
    },
    {
      id: "error-spike",
      name: "Error spike",
      enabled: false,
      conditionLabel: "Volume ≥ 50 in 10 min",
      conditionType: "volume_threshold",
      filters: [],
      channels: ["webhook incident-bot"],
      cooldownMinutes: 60,
      lastFiredLabel: "Fired yesterday",
    },
  ];

  return {
    administers: true,
    chrome,
    rules,
    showForm: true,
    status: "ready",
  };
}

export const alertsStates = {
  empty,
  populated,
} as const;

export const alertsStateNames = ["empty", "populated"] as const;

export type AlertsStateName = (typeof alertsStateNames)[number];

export function isAlertsStateName(value: string | null): value is AlertsStateName {
  return value != null && (alertsStateNames as readonly string[]).includes(value);
}
