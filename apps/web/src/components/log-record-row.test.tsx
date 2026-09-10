import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { LogRecordSummary } from "../lib/log-records";
import { LogRecordRow } from "./log-record-row";

function sample(): LogRecordSummary {
  return {
    attributes: { attempt: 2 },
    category: ["authorize"],
    errorReportEventId: null,
    eventId: "r1",
    id: "r1",
    level: "error",
    message: "authorize failed",
    occurredAt: "2026-09-10T13:02:43.005Z",
    receivedAt: "2026-09-10T13:02:43.005Z",
    service: { environment: "prod", name: "payments" },
  };
}

function rowSurface(className: string): boolean {
  return /(?:^|\s)bg-muted(?:\s|$)/.test(className);
}

describe("LogRecordRow surface", () => {
  test("a collapsed row sits on the card", () => {
    render(
      <ul>
        <LogRecordRow record={sample()} />
      </ul>,
    );

    const row = screen.getByRole("button");
    expect(row.className).toContain("bg-card");
    expect(rowSurface(row.className)).toBe(false);
  });

  test("an expanded row uses the muted surface", () => {
    render(
      <ul>
        <LogRecordRow defaultExpanded record={sample()} />
      </ul>,
    );

    expect(rowSurface(screen.getByRole("button").className)).toBe(true);
  });
});
