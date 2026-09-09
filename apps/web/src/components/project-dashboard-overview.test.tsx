import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { healthTone, ProjectDashboardOverview } from "./project-dashboard-overview";
import {
  projectDashboardOverviewStateNames,
  projectDashboardOverviewStates,
} from "./project-dashboard-overview.states";

describe("healthTone", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  test("recent enough reads as success", () => {
    expect(healthTone("2026-09-09T11:50:00.000Z", now)).toBe("success");
  });

  test("older than an hour but under a day reads as warning", () => {
    expect(healthTone("2026-09-09T06:00:00.000Z", now)).toBe("warning");
  });

  test("older than a day reads as neutral", () => {
    expect(healthTone("2026-09-01T00:00:00.000Z", now)).toBe("neutral");
  });

  test("never received reads as neutral", () => {
    expect(healthTone(null, now)).toBe("neutral");
  });
});

describe("ProjectDashboardOverview named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(projectDashboardOverviewStates)).toEqual([
      ...projectDashboardOverviewStateNames,
    ]);
  });

  test("empty shows zero totals, no breakdowns, and a flat volume chart", () => {
    render(<ProjectDashboardOverview {...projectDashboardOverviewStates.empty()} />);

    expect(screen.getAllByText("Error reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No reports yet.").length).toBe(2);
    expect(screen.getAllByText("Never").length).toBe(3);
    expect(
      screen.getByRole("img", { name: /0 error reports and 0 log records in total/ }),
    ).toBeTruthy();
  });

  test("populated shows totals, trend, breakdowns, last-event times, and a volume chart", () => {
    render(<ProjectDashboardOverview {...projectDashboardOverviewStates.populated()} />);

    expect(screen.getByText("84")).toBeTruthy();
    expect(screen.getByText("Up 38% from the prior period")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
    expect(screen.getByText("cpython")).toBeTruthy();
    expect(screen.queryByText("Never")).toBeNull();
    expect(
      screen.getByRole("img", { name: /84 error reports and 512 log records in total/ }),
    ).toBeTruthy();
  });
});
