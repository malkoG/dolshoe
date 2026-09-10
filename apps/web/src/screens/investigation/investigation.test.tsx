import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { InvestigationView } from "./investigation";
import { investigationStateNames, investigationStates } from "./investigation.states";

function expectFigmaTrail(current: string) {
  const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(within(nav).getByText("Acme Payments")).toBeTruthy();
  expect(within(nav).getByText("checkout-api")).toBeTruthy();
  expect(within(nav).getByText("Traces")).toBeTruthy();
  expect(within(nav).getByText(current)).toBeTruthy();
}

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the view drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("Investigation named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(investigationStates)).toEqual([...investigationStateNames]);
  });

  test("incomplete shows the orphan, the missing parent, and attached error and log", () => {
    render(<InvestigationView {...investigationStates.incomplete()} />);

    expect(screen.getByRole("heading", { name: "Investigation" })).toBeTruthy();
    expectFigmaTrail("Investigation 4f2a…9c1e");
    expect(screen.getByText("incomplete")).toBeTruthy();
    expect(screen.getByText("1 parent not received")).toBeTruthy();
    expect(screen.getByText("Parent span not received")).toBeTruthy();
    expect(screen.getByText("orphan.handler")).toBeTruthy();
    expect(screen.getAllByText("parent pending").length).toBeGreaterThan(1);
    expect(
      screen.getByText("CardDeclinedError: card declined by issuer (do_not_honor)"),
    ).toBeTruthy();
    expect(screen.getByText("issuer latency 1.8s exceeds 1s budget")).toBeTruthy();
    expect(screen.getByText("Nested by parent, oldest first")).toBeTruthy();
  });

  test("truncated names the cap and keeps the tree as spans only", () => {
    render(<InvestigationView {...investigationStates.truncated()} />);

    expectFigmaTrail("Investigation 9c1e…4f2a");
    expect(screen.getByText("2,000 of 2,413 spans")).toBeTruthy();
    expect(
      screen.getByText(
        "Showing the first 2,000 spans — this trace holds more than are shown. Narrow by service or time to see the rest.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("This trace holds more spans than are shown")).toBeTruthy();
    expect(screen.getByText("POST /api/v1/batch")).toBeTruthy();
    expect(screen.getByText("process.item[2]")).toBeTruthy();
    expect(screen.queryByText("incomplete")).toBeNull();
    expect(screen.queryByText("Parent span not received")).toBeNull();
  });

  test("loading is the in-progress state Figma actually draws", () => {
    render(<InvestigationView {...investigationStates.loading()} />);

    expect(screen.getByRole("heading", { name: "Investigation" })).toBeTruthy();
    expectFigmaTrail("Investigation");
    expect(screen.getByText("Loading trace…")).toBeTruthy();
    expect(screen.getByText("Fetching this trace's spans from the API.")).toBeTruthy();
  });

  test("omitting trail leaves the breadcrumb to PageShell", () => {
    render(<InvestigationView status="loading" />);

    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Investigation" })).toBeTruthy();
  });
});
