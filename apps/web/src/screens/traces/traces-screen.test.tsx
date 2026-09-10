import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { tracesChromeTrail, TracesReviewSurface } from "./traces-chrome";
import { tracesScreenStateNames, tracesScreenStates } from "./traces-screen.states";

function expectFullLayoutChrome(): void {
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "This project" })).toBeTruthy();
  expect(screen.getByLabelText("Switch project")).toBeTruthy();
  expect(screen.getAllByText(tracesChromeTrail[0]).length).toBeGreaterThan(0);
  expect(screen.getAllByText(tracesChromeTrail[1]).length).toBeGreaterThan(0);
  expect(screen.getByText("Traces", { selector: "[aria-current=page]" })).toBeTruthy();
}

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the screen drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("TracesScreen named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(tracesScreenStates)).toEqual([...tracesScreenStateNames]);
  });

  test("empty offers setup when nothing has been exported", () => {
    render(<TracesReviewSurface {...tracesScreenStates.empty()} />);

    expectFullLayoutChrome();
    expect(screen.getByRole("heading", { name: "Traces" })).toBeTruthy();
    expect(screen.getByText("No traces yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set up reporting" })).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  test("populated lists every designed kind and the failing pair", () => {
    render(<TracesReviewSurface {...tracesScreenStates.populated()} />);

    expectFullLayoutChrome();
    expect(screen.getByText("6 traces")).toBeTruthy();
    expect(screen.getByText("GET /checkout")).toBeTruthy();
    expect(screen.getByText("POST /api/v1/payments/authorize")).toBeTruthy();
    expect(screen.getByText("send-receipt")).toBeTruthy();
    expect(screen.getByText("issuer.charge")).toBeTruthy();
    expect(screen.getByText("order.created")).toBeTruthy();
    expect(screen.getByText("cart.rebuild")).toBeTruthy();
    expect(screen.getByText("2 failing")).toBeTruthy();
    expect(screen.getByText("1 failing")).toBeTruthy();
    expect(screen.getAllByText("server").length).toBe(2);
    expect(screen.getByText("consumer")).toBeTruthy();
    expect(screen.getByText("client")).toBeTruthy();
    expect(screen.getByText("producer")).toBeTruthy();
    expect(screen.getByText("internal")).toBeTruthy();
    expect(screen.getByText(/Showing/)).toBeTruthy();
    expect(screen.getByText("Sorted newest first")).toBeTruthy();
  });

  test("error names the failure and offers a retry", () => {
    render(<TracesReviewSurface {...tracesScreenStates.error()} />);

    expectFullLayoutChrome();
    expect(screen.getByText("Couldn't load traces")).toBeTruthy();
    expect(screen.getByText("The API did not answer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  test("inProgress says the list is still loading", () => {
    render(<TracesReviewSurface {...tracesScreenStates.inProgress()} />);

    expectFullLayoutChrome();
    expect(screen.getByText("Loading traces…")).toBeTruthy();
    expect(screen.getByText("Fetching the newest traces from the API.")).toBeTruthy();
  });

  test("a filter that matches nothing is an empty list, not a missing project", () => {
    render(<TracesReviewSurface {...tracesScreenStates.populated()} query="zzzz" />);

    expect(screen.getByText("No matching traces")).toBeTruthy();
    expect(screen.getByText("Try another search.")).toBeTruthy();
    expect(screen.queryByText("No traces yet")).toBeNull();
    expect(screen.getByText(/Showing/)).toBeTruthy();
  });
});
