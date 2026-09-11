import { describe, expect, test } from "vitest";

import { DEFAULT_VIEWPORT, screenshotOf, SURFACES, surfaceByName, viewportFor } from "./surfaces";

describe("UI review surface registry", () => {
  test("names are unique and every surface has at least one state", () => {
    const names = SURFACES.map((surface) => surface.name);
    expect(new Set(names).size).toBe(names.length);
    for (const surface of SURFACES) {
      expect(surface.states.length).toBeGreaterThan(0);
    }
  });

  test("paper assignments match the post-fan-out reconcile", () => {
    const papers = Object.fromEntries(SURFACES.map((surface) => [surface.name, surface.paper]));
    expect(papers).toEqual({
      "exception-tree": "panel",
      "project-dashboard-overview": "panel",
      investigation: "full-page",
      traces: "framed-fit",
      "project-settings": "full-page",
      reports: "framed-fit",
      logs: "framed-fit",
      invitation: "panel",
      login: "panel",
      organizations: "panel",
      "org-settings": "full-page",
      overview: "framed-fit",
      alerts: "panel",
      "report-detail": "full-page",
      "org-projects": "full-page",
      tokens: "full-page",
    });
  });

  test("overview is the full board; project-dashboard-overview is the widget", () => {
    expect(surfaceByName("overview")?.paper).toBe("framed-fit");
    expect(surfaceByName("project-dashboard-overview")?.paper).toBe("panel");
    expect(surfaceByName("overview")?.states).not.toEqual(
      surfaceByName("project-dashboard-overview")?.states,
    );
  });

  test("paper kind selects the capture viewport the PASS locked", () => {
    const traces = surfaceByName("traces")!;
    const projectSettings = surfaceByName("project-settings")!;
    const login = surfaceByName("login")!;
    const alerts = surfaceByName("alerts")!;
    const orgProjects = surfaceByName("org-projects")!;
    const tokens = surfaceByName("tokens")!;

    expect(viewportFor(traces, traces.states[0])).toEqual(DEFAULT_VIEWPORT["framed-fit"]);
    expect(viewportFor(projectSettings, projectSettings.states[0])).toEqual(
      DEFAULT_VIEWPORT["full-page"],
    );
    expect(viewportFor(login, login.states[0])).toEqual(DEFAULT_VIEWPORT.panel);
    expect(viewportFor(alerts, alerts.states[0])).toEqual({ width: 1440, height: 960 });
    expect(viewportFor(orgProjects, "compact")).toEqual({ width: 1024, height: 960 });
    expect(viewportFor(tokens, tokens.states[0])).toEqual({ width: 1440, height: 1006 });
  });

  test("tokens photographs the page so issued and revoke dialogs are in frame", () => {
    expect(screenshotOf(surfaceByName("tokens")!)).toBe("page");
  });
});
