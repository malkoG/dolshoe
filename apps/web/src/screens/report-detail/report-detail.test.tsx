import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ReportDetail } from "./report-detail";
import { reportDetailStateNames, reportDetailStates } from "./report-detail.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the page drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("ReportDetail named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(reportDetailStates)).toEqual([...reportDetailStateNames]);
  });

  test("loading keeps the project chrome and says the report is on its way", () => {
    render(<ReportDetail {...reportDetailStates.loading()} />);

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByText("Reports", { selector: "[aria-current='page']" })).toBeTruthy();
    expect(screen.getByText("Loading the report…")).toBeTruthy();
    expect(screen.getByText("Fetching the stored exception and its frames.")).toBeTruthy();
  });

  test("error keeps the project chrome and offers a retry", () => {
    render(<ReportDetail {...reportDetailStates.error()} />);

    expect(screen.getByText("Couldn't load this report")).toBeTruthy();
    expect(screen.getByText("The API did not return this report.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  test("populated paints the Figma report — exception, tags, breadcrumbs, footer", () => {
    render(<ReportDetail {...reportDetailStates.populated()} />);

    expect(screen.getByText("TypeError · #7f2a9c1e")).toBeTruthy();
    expect(
      screen.getByText("checkout-api", { selector: "[data-slot='panel-controls'] span" }),
    ).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();
    expect(screen.getByText("Node 22.3.0")).toBeTruthy();
    expect(screen.getByText("user_8f21")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "TypeError" })).toBeTruthy();
    expect(screen.getByText('Cannot read properties of undefined (reading "amount")')).toBeTruthy();
    expect(screen.getByText("code ERR_UNDEFINED_READ")).toBeTruthy();
    expect(screen.getByText("Caused by")).toBeTruthy();
    expect(screen.getByText("CardDeclinedError")).toBeTruthy();
    expect(screen.getByText("handleCheckout")).toBeTruthy();

    expect(screen.getByText("Tags")).toBeTruthy();
    expect(screen.getByText("ap-northeast-2")).toBeTruthy();
    expect(screen.getByText("Attributes")).toBeTruthy();
    expect(screen.getByText("/api/v1/checkout")).toBeTruthy();
    expect(screen.getByText("Breadcrumbs")).toBeTruthy();
    expect(screen.getByText("GET /cart → /checkout")).toBeTruthy();
    expect(screen.getByText("payment object missing for express flow")).toBeTruthy();

    expect(screen.getByText("@dolshoe/sdk-js 0.4.2")).toBeTruthy();
    expect(screen.getByText(/onerror/)).toBeTruthy();
    expect(screen.getByText(/\(unhandled\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "trace 4f2a9c1e" })).toBeTruthy();
    expect(screen.getByText("#7f2a9c1e")).toBeTruthy();
  });
});
