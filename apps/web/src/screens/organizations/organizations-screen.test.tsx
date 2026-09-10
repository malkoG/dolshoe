import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ORGANIZATION_SLUG_CONFLICT, OrganizationsScreen } from "./organizations-screen";
import {
  organizationsScreenStateNames,
  organizationsScreenStates,
} from "./organizations-screen.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the screen drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("OrganizationsScreen named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(organizationsScreenStates)).toEqual([...organizationsScreenStateNames]);
  });

  test("empty shows the mark, the empty copy, and no back link", () => {
    render(<OrganizationsScreen {...organizationsScreenStates.empty()} />);

    expect(screen.getByText("dolshoe")).toBeTruthy();
    expect(screen.queryByText("Back to Acme Payments")).toBeNull();
    expect(screen.getByText("You are not in an organization yet")).toBeTruthy();
    expect(
      screen.getByText("Create one below to start collecting error reports and logs."),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("populated lists each organization and a way back into the first one", () => {
    render(<OrganizationsScreen {...organizationsScreenStates.populated()} />);

    expect(screen.getByRole("heading", { name: "Where your projects live" })).toBeTruthy();
    expect(screen.getByText("Back to Acme Payments")).toBeTruthy();
    expect(screen.getByText("Acme Payments")).toBeTruthy();
    expect(screen.getByText("acme-payments")).toBeTruthy();
    expect(screen.getByText("Northwind Logistics")).toBeTruthy();
    expect(screen.getByText("Personal sandbox")).toBeTruthy();
    expect(screen.getByText("owner")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("member")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("error keeps the list and shows the slug-collision strip", () => {
    render(<OrganizationsScreen {...organizationsScreenStates.error()} />);

    expect(screen.getByText("Acme Payments")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(ORGANIZATION_SLUG_CONFLICT);
  });
});
