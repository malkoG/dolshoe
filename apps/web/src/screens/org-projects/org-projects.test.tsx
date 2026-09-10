import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { dateFormatter } from "../../lib/format";
import { OrgProjectsReview } from "./org-chrome";
import { orgProjectsStateNames, orgProjectsStates } from "./org-projects.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the screen drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("OrgProjects named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(orgProjectsStates)).toEqual([...orgProjectsStateNames]);
  });

  test("populated lists four projects beside the create form", () => {
    render(<OrgProjectsReview {...orgProjectsStates.populated()} />);

    expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(screen.getByText("One token set per project")).toBeTruthy();
    expect(screen.getByText("4 projects")).toBeTruthy();
    expect(screen.getByText("checkout-api", { selector: "strong" })).toBeTruthy();
    expect(
      screen.getByText(`Created ${dateFormatter.format(new Date("2026-09-02T12:00:00.000Z"))}`),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create project" })).toBeTruthy();
    expect(screen.getByPlaceholderText("New project name…")).toBeTruthy();
    expect(screen.getByRole("link", { name: "All projects" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Northwind Logistics" })).toBeNull();
    expect(screen.queryByText("No projects yet")).toBeNull();
  });

  test("empty keeps the create form and says there are no projects yet", () => {
    render(<OrgProjectsReview {...orgProjectsStates.empty()} />);

    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Create one, issue it a token, and point a reporter at the DSN it gives you.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Projects", { selector: "[data-slot='panel-summary']" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create project" })).toBeTruthy();
    expect(screen.queryByText("checkout-api")).toBeNull();
  });

  test("compact shows the longer 1024 list without inventing a second layout heading", () => {
    render(<OrgProjectsReview {...orgProjectsStates.compact()} />);

    expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(screen.getByText("7 projects")).toBeTruthy();
    expect(screen.getByText("data-pipeline-nightly-rollup", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("mobile-ios", { selector: "strong" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create project" })).toBeTruthy();
  });

  test("orgMenuOpen shows the switcher list over the populated projects", () => {
    render(<OrgProjectsReview {...orgProjectsStates.orgMenuOpen()} />);

    expect(screen.getByText("Switch organization")).toBeTruthy();
    expect(screen.getByText("Northwind Logistics")).toBeTruthy();
    expect(screen.getByText("Personal sandbox")).toBeTruthy();
    expect(screen.getByText("Kestrel Robotics")).toBeTruthy();
    expect(screen.getByRole("link", { name: /All organizations/ })).toBeTruthy();
    expect(screen.getByText("4 projects")).toBeTruthy();
    expect(screen.getByText("checkout-api", { selector: "strong" })).toBeTruthy();
  });
});
