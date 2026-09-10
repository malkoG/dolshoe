import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { OrgSettings } from "./org-settings";
import { orgSettingsStateNames, orgSettingsStates } from "./org-settings.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the view drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("OrgSettings named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(orgSettingsStates)).toEqual([...orgSettingsStateNames]);
  });

  test("admin shows the rename field and the leave action", () => {
    render(<OrgSettings {...orgSettingsStates.admin()} />);

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
    render(<OrgSettings {...orgSettingsStates.leaveRefused()} />);

    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Acme Payments");
    expect(screen.getByRole("button", { name: "Leave organization" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "You're the only owner — promote another member first.",
    );
  });

  test("a member does not see the rename panel", () => {
    render(<OrgSettings {...orgSettingsStates.admin()} canRename={false} />);

    expect(screen.queryByText("Organization name")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("button", { name: "Leave organization" })).toBeTruthy();
  });
});
