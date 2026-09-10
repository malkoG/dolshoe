import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProjectSettingsReview } from "./project-settings-chrome";
import { projectSettingsStateNames, projectSettingsStates } from "./project-settings.states";

function expectSettingsChrome(): void {
  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(trail).getByText("Acme Payments")).toBeTruthy();
  expect(within(trail).getByText("checkout-api")).toBeTruthy();
  expect(within(trail).getByText("Settings")).toBeTruthy();

  expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeTruthy();
  const sidebar = screen.getByRole("navigation", { name: "Sidebar" });
  expect(within(sidebar).getByText("Overview")).toBeTruthy();
  expect(within(sidebar).getByText("All projects")).toBeTruthy();
  expect(sidebar.querySelector("[aria-current='page']")?.textContent).toContain("Settings");
  expect(screen.getByText("Koding Warrior")).toBeTruthy();
}

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the view drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("ProjectSettings named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(projectSettingsStates)).toEqual([...projectSettingsStateNames]);
  });

  test("saved shows the rename form and that the last save landed", () => {
    render(<ProjectSettingsReview {...projectSettingsStates.saved()} />);

    expectSettingsChrome();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "checkout-api");
    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "checkout-api");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByText("Saved.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("error keeps the conflicting slug and names the 409", () => {
    render(<ProjectSettingsReview {...projectSettingsStates.error()} />);

    expectSettingsChrome();
    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "payments");
    expect(screen.getByRole("alert").textContent).toContain(
      "A project with that slug already exists in this organization.",
    );
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  test("readOnly tells a member that an owner or admin renames the project", () => {
    render(<ProjectSettingsReview {...projectSettingsStates.readOnly()} />);

    expectSettingsChrome();
    expect(
      screen.getByText("An owner or admin of this organization renames a project."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
