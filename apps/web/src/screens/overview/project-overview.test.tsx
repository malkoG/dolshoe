import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProjectOverview } from "./project-overview";
import { projectOverviewStateNames, projectOverviewStates } from "./project-overview.states";

describe("ProjectOverview named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(projectOverviewStates)).toEqual([...projectOverviewStateNames]);
  });

  test("populated paints the Figma chrome, heading, totals, and volume chart", () => {
    render(<ProjectOverview {...projectOverviewStates.populated()} />);

    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(screen.getAllByText("Acme Payments").length).toBeGreaterThan(0);
    expect(screen.getAllByText("checkout-api").length).toBeGreaterThan(0);
    expect(screen.getByText("Koding Warrior")).toBeTruthy();
    expect(screen.getByText("@kodingwarrior")).toBeTruthy();
    expect(screen.getByText("Sep 4, 2026 – Sep 10, 2026")).toBeTruthy();
    expect(screen.getByText("1,284")).toBeTruthy();
    expect(screen.getByText("48,910")).toBeTruthy();
    expect(screen.getByText("3,207")).toBeTruthy();
    expect(screen.getByText("Up 18% from the prior period")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
    expect(screen.getByText("Node 22.3.0")).toBeTruthy();
    expect(screen.queryByText("Never")).toBeNull();
    expect(
      screen.getByRole("img", { name: /122 error reports and 571 log records in total/ }),
    ).toBeTruthy();
  });

  test("loading keeps the chrome and shows the dashboard DataState", () => {
    render(<ProjectOverview {...projectOverviewStates.loading()} />);

    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(screen.getByText("Loading dashboard…")).toBeTruthy();
    expect(screen.getByText("Fetching this project's recent activity.")).toBeTruthy();
    expect(screen.queryByText("1,284")).toBeNull();
  });

  test("error keeps the chrome and shows the failed DataState", () => {
    render(<ProjectOverview {...projectOverviewStates.error()} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Couldn't load the dashboard")).toBeTruthy();
    expect(screen.getByText("Something went wrong while loading the dashboard.")).toBeTruthy();
    expect(screen.queryByText("Loading dashboard…")).toBeNull();
  });
});
