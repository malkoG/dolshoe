import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ReportsNamedState } from "./reports-chrome";
import { reportsViewStateNames, reportsViewStates } from "./reports-view.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the view drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
function figmaChrome(): void {
  expect(screen.getAllByText("Acme Payments").length).toBeGreaterThan(0);
  expect(screen.getAllByText("checkout-api").length).toBeGreaterThan(0);
  expect(screen.getByText("Koding Warrior")).toBeTruthy();
  expect(screen.getByText("@kodingwarrior")).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "This project" })).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Organization" })).toBeTruthy();
  const reportsNav = screen
    .getByRole("navigation", { name: "This project" })
    .querySelector("[aria-current='page']");
  expect(reportsNav?.textContent).toMatch(/Reports/);
  const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
  expect(trail.textContent).toMatch(/Acme Payments\s*\/\s*checkout-api\s*\/\s*Reports/);
}

describe("ReportsView named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(reportsViewStates)).toEqual([...reportsViewStateNames]);
  });

  test("every named state photographs the Figma sidebar, trail, and body", () => {
    for (const name of reportsViewStateNames) {
      const { unmount } = render(<ReportsNamedState {...reportsViewStates[name]()} />);
      figmaChrome();
      unmount();
    }
  });

  test("empty is the setup panel, not an empty table", () => {
    render(<ReportsNamedState {...reportsViewStates.empty()} />);

    figmaChrome();
    expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy();
    expect(screen.getByText("Set up reporting")).toBeTruthy();
    expect(screen.getByText("Watching for the first event")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Issue an ingestion token" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Issue a token" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Point your application at it" })).toBeTruthy();
    expect(screen.getByText(/Dolshoe\.init/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Make it fail once" })).toBeTruthy();
    expect(screen.queryByText("TypeError")).toBeNull();
  });

  test("populated lists the Figma issues, services, and footer count", () => {
    render(<ReportsNamedState {...reportsViewStates.populated()} />);

    figmaChrome();
    expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy();
    expect(screen.getByText("5 reports")).toBeTruthy();
    expect(screen.getByRole("link", { name: "TypeError" })).toBeTruthy();
    expect(screen.getByText('Cannot read properties of undefined (reading "amount")')).toBeTruthy();
    expect(screen.getByText("handleCheckout · checkout.ts:214")).toBeTruthy();
    expect(screen.getByText("CardDeclinedError")).toBeTruthy();
    expect(screen.getByText("TimeoutError")).toBeTruthy();
    expect(screen.getByText("ValueError")).toBeTruthy();
    expect(screen.getByText("RangeError")).toBeTruthy();
    expect(screen.getAllByText("checkout-api").length).toBeGreaterThan(0);
    expect(screen.getAllByText("storefront-web").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Python 3.12").length).toBeGreaterThan(0);
    expect(screen.getByText("#7f2a9c1e")).toBeTruthy();
    expect(screen.getByRole("contentinfo").textContent).toMatch(/Showing\s+5\s+of\s+24 reports/);
    expect(screen.getByText("Sorted newest first")).toBeTruthy();
  });

  test("error names the failed load and offers a retry", () => {
    render(<ReportsNamedState {...reportsViewStates.error()} />);

    figmaChrome();
    expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy();
    expect(screen.getByText("Couldn't load error reports")).toBeTruthy();
    expect(screen.getByText("Something went wrong while loading error reports.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("Set up reporting")).toBeNull();
    expect(screen.queryByText("TypeError")).toBeNull();
  });
});
