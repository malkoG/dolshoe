import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProjectSettings } from "./project-settings";
import { projectSettingsStateNames, projectSettingsStates } from "./project-settings.states";

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
    render(<ProjectSettings {...projectSettingsStates.saved()} />);

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "checkout-api");
    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "checkout-api");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByText("Saved.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("error keeps the conflicting slug and names the 409", () => {
    render(<ProjectSettings {...projectSettingsStates.error()} />);

    expect(screen.getByLabelText("Slug")).toHaveProperty("value", "payments");
    expect(screen.getByRole("alert").textContent).toContain(
      "A project with that slug already exists in this organization.",
    );
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  test("readOnly tells a member that an owner or admin renames the project", () => {
    render(<ProjectSettings {...projectSettingsStates.readOnly()} />);

    expect(
      screen.getByText("An owner or admin of this organization renames a project."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
