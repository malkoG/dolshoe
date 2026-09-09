import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProjectDashboardOverview } from "./project-dashboard-overview";
import {
  projectDashboardOverviewStateNames,
  projectDashboardOverviewStates,
} from "./project-dashboard-overview.states";

describe("ProjectDashboardOverview named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(projectDashboardOverviewStates)).toEqual([
      ...projectDashboardOverviewStateNames,
    ]);
  });

  test("empty shows zero totals and no breakdowns", () => {
    render(<ProjectDashboardOverview {...projectDashboardOverviewStates.empty()} />);

    expect(screen.getByText("Error reports")).toBeTruthy();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No reports yet.").length).toBe(2);
    expect(screen.getAllByText("Never").length).toBe(3);
  });

  test("populated shows totals, trend, breakdowns, and last-event times", () => {
    render(<ProjectDashboardOverview {...projectDashboardOverviewStates.populated()} />);

    expect(screen.getByText("84")).toBeTruthy();
    expect(screen.getByText("Up 38% from the prior period")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
    expect(screen.getByText("cpython")).toBeTruthy();
    expect(screen.queryByText("Never")).toBeNull();
  });
});
