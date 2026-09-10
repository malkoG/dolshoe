import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LogsScreen } from "./logs-screen";
import { logsScreenStateNames, logsScreenStates } from "./logs-screen.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the screen drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("LogsScreen named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(logsScreenStates)).toEqual([...logsScreenStateNames]);
  });

  test("every named state paints the Figma trail", () => {
    for (const name of logsScreenStateNames) {
      const { unmount } = render(<LogsScreen {...logsScreenStates[name]()} />);

      const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(trail.textContent).toContain("Acme Payments");
      expect(trail.textContent).toContain("checkout-api");
      expect(trail.textContent).toContain("Logs");
      unmount();
    }
  });

  test("the live route's embedded view does not paint a second trail", () => {
    render(<LogsScreen {...logsScreenStates.populated()} embedded />);

    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  test("empty says nothing has been sent yet", () => {
    render(<LogsScreen {...logsScreenStates.empty()} />);

    expect(screen.getByRole("heading", { name: "Logs" })).toBeTruthy();
    expect(screen.getByText("No log records yet")).toBeTruthy();
    expect(screen.getByText(/Nothing has sent one to this project yet/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /0 logs and 0 errors in total/ })).toBeTruthy();
  });

  test("populated shows the filtered list with the authorize row open", () => {
    render(<LogsScreen {...logsScreenStates.populated()} />);

    expect(screen.getByText("7 records")).toBeTruthy();
    expect(screen.getByRole("contentinfo").textContent).toContain("Showing 4 of 7 records");
    expect(screen.getByText("level: error · Sorted newest first")).toBeTruthy();
    expect(screen.getByText("authorize failed: do_not_honor")).toBeTruthy();
    expect(screen.getByText("attempt")).toBeTruthy();
    expect(screen.getByText("stripe")).toBeTruthy();
    expect(screen.getByText("Compact")).toBeTruthy();
    expect(screen.getByRole("img", { name: /4975 logs and 245 errors in total/ })).toBeTruthy();
  });

  test("error names the failed load", () => {
    render(<LogsScreen {...logsScreenStates.error()} />);

    expect(screen.getByText("Couldn't load log records")).toBeTruthy();
    expect(screen.getByText("The API refused the request.")).toBeTruthy();
  });

  test("live keeps the console and the selected log both visible", () => {
    render(<LogsScreen {...logsScreenStates.live()} />);

    expect(screen.getByRole("button", { name: "Stop live" })).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("POST /api/v1/checkout")).toBeTruthy();
    expect(screen.getByText("Log:")).toBeTruthy();
    expect(screen.getAllByText(/authorize failed: do_not_honor/).length).toBeGreaterThan(1);
    expect(screen.getByText("12 records · 3 spans in window")).toBeTruthy();
    expect(screen.getByText("apps/api/src/payments/authorize.ts")).toBeTruthy();
  });
});
