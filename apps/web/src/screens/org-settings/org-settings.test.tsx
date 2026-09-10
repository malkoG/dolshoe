import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { OrgSettingsReview } from "./org-settings-chrome";
import { OrgSettings } from "./org-settings";
import { orgSettingsStateNames, orgSettingsStates } from "./org-settings.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. Named states render through `OrgSettingsReview` so the
 * photographed Sidebar + TopBar stay tied to the factory. The live route
 * mounts `OrgSettings` alone under PageShell.
 */
function expectOrgSettingsChrome(): void {
  const sidebar = screen.getByRole("navigation", { name: "Organization" });
  expect(sidebar.textContent).toContain("All projects");
  expect(sidebar.textContent).toContain("Members");
  expect(sidebar.textContent).toContain("Organizations");
  const current = sidebar.querySelector('[aria-current="page"]');
  expect(current?.textContent).toContain("Settings");

  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(trail.textContent).toContain("Acme Payments");
  expect(trail.textContent).toContain("Settings");
  expect(screen.getByText("Koding Warrior")).toBeTruthy();
  expect(screen.getByText("@kodingwarrior")).toBeTruthy();
}

describe("OrgSettings named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(orgSettingsStates)).toEqual([...orgSettingsStateNames]);
  });

  test("every named state photographs the Figma sidebar and trail", () => {
    for (const name of orgSettingsStateNames) {
      const { unmount } = render(<OrgSettingsReview {...orgSettingsStates[name]()} />);
      expectOrgSettingsChrome();
      expect(screen.getByRole("navigation", { name: "Organization" })).toBeTruthy();
      expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
      unmount();
    }
  });

  test("the public view alone does not paint chrome", () => {
    render(<OrgSettings {...orgSettingsStates.admin()} />);

    expect(screen.queryByRole("navigation", { name: "Organization" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "This project" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  test("admin shows the rename field and the leave action", () => {
    render(<OrgSettingsReview {...orgSettingsStates.admin()} />);

    expectOrgSettingsChrome();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("Rename this organization, or leave it.")).toBeTruthy();
    expect(screen.getByText("Organization name")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Acme Payments");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByText("Leave this organization")).toBeTruthy();
    expect(
      screen.getByText(
        "You'll lose access to every project here. Someone can invite you back later.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave organization" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("leaveRefused keeps the form and names the only-owner refusal", () => {
    render(<OrgSettingsReview {...orgSettingsStates.leaveRefused()} />);

    expectOrgSettingsChrome();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Acme Payments");
    expect(screen.getByRole("button", { name: "Leave organization" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "You're the only owner — promote another member first.",
    );
  });

  test("a member does not see the rename panel", () => {
    render(<OrgSettingsReview {...orgSettingsStates.admin()} canRename={false} />);

    expectOrgSettingsChrome();
    expect(screen.queryByText("Organization name")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("button", { name: "Leave organization" })).toBeTruthy();
  });
});
