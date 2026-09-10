import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Alerts } from "./alerts";
import { alertsStateNames, alertsStates } from "./alerts.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the screen drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("Alerts named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(alertsStates)).toEqual([...alertsStateNames]);
  });

  test("empty explains what a rule watches and hides the create form", () => {
    render(<Alerts {...alertsStates.empty()} />);

    expect(screen.getByRole("heading", { name: "Alerts" })).toBeTruthy();
    expect(screen.getByText("No alert rules yet")).toBeTruthy();
    expect(screen.getByText(/A rule watches this project for a new fingerprint/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "New rule" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create rule" })).toBeNull();
    expect(screen.queryByText("Any new error")).toBeNull();
  });

  test("populated lists the three rules and the create form", () => {
    render(<Alerts {...alertsStates.populated()} />);

    expect(screen.getByText("3 rules")).toBeTruthy();
    expect(screen.getByText("Any new error")).toBeTruthy();
    expect(screen.getByText("new_fingerprint")).toBeTruthy();
    expect(screen.getByText("slack #checkout-alerts")).toBeTruthy();
    expect(screen.getByText("Payment failures in production")).toBeTruthy();
    expect(screen.getByText("filter_match")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
    expect(screen.getByText("Error spike")).toBeTruthy();
    expect(screen.getByText("paused")).toBeTruthy();
    expect(screen.getByText("volume_threshold")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create rule" })).toBeTruthy();
    expect(screen.getByText(/Volume threshold rules also take a count/)).toBeTruthy();
  });
});
