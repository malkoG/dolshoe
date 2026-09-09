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
