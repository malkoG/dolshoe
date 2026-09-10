import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { LogsReviewView } from "./logs-chrome";
import { LogsScreen } from "./logs-screen";
import { logsScreenStateNames, logsScreenStates } from "./logs-screen.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. Named states render through `LogsReviewView` so the
 * photographed Sidebar + TopBar stay tied to the factory. The live route
 * mounts `LogsScreen` alone under PageShell.
 */
describe("LogsScreen named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(logsScreenStates)).toEqual([...logsScreenStateNames]);
  });

  test("every named state photographs the Figma sidebar and trail", () => {
    for (const name of logsScreenStateNames) {
      const { unmount } = render(<LogsReviewView {...logsScreenStates[name]()} />);

      const sidebar = screen.getByRole("navigation", { name: "This project" });
      expect(sidebar.textContent).toContain("Overview");
      expect(screen.getByLabelText("Switch project").textContent).toContain("checkout-api");
      const current = sidebar.querySelector('[aria-current="page"]');
      expect(current?.textContent).toContain("Logs");

      const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(trail.textContent).toContain("Acme Payments");
      expect(trail.textContent).toContain("checkout-api");
      expect(trail.textContent).toContain("Logs");
      unmount();
    }
  });

  test("the public view alone does not paint chrome", () => {
    render(<LogsScreen {...logsScreenStates.populated()} />);

    expect(screen.queryByRole("navigation", { name: "This project" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  test("empty says nothing has been sent yet", () => {
    render(<LogsReviewView {...logsScreenStates.empty()} />);

    expect(screen.getByRole("heading", { name: "Logs" })).toBeTruthy();
    expect(screen.getByText("No log records yet")).toBeTruthy();
    expect(screen.getByText(/Nothing has sent one to this project yet/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /0 logs and 0 errors in total/ })).toBeTruthy();
  });

  test("populated shows the filtered list with the authorize row open", () => {
    render(<LogsReviewView {...logsScreenStates.populated()} />);

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
    render(<LogsReviewView {...logsScreenStates.error()} />);

    expect(screen.getByText("Couldn't load log records")).toBeTruthy();
    expect(screen.getByText("The API refused the request.")).toBeTruthy();
  });

  test("live keeps the console and the selected log both visible", () => {
    render(<LogsReviewView {...logsScreenStates.live()} />);

    expect(screen.getByRole("button", { name: "Stop live" })).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("POST /api/v1/checkout")).toBeTruthy();
    expect(screen.getByText("Log:")).toBeTruthy();
    expect(screen.getAllByText(/authorize failed: do_not_honor/).length).toBeGreaterThan(1);
    expect(screen.getByText("12 records · 3 spans in window")).toBeTruthy();
    expect(screen.getByText("apps/api/src/payments/authorize.ts")).toBeTruthy();
  });
});
