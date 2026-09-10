import { describe, expect, test } from "vitest";

import {
  formatFingerprintChip,
  formatSpanCountLabel,
  formatTraceChip,
  formatTruncatedBanner,
} from "./format";

describe("investigation format helpers", () => {
  test("formatTraceChip is first four, ellipsis, last four", () => {
    expect(formatTraceChip("4f2aaaaaaaaaaaaaaaaaaaaaaaaaa9c1e")).toBe("4f2a…9c1e");
  });

  test("formatSpanCountLabel names the cap when the trace is truncated", () => {
    expect(formatSpanCountLabel(6, 6, false)).toBe("6 spans");
    expect(formatSpanCountLabel(2000, 2413, true)).toBe("2,000 of 2,413 spans");
  });

  test("formatTruncatedBanner is the locked truncated copy", () => {
    expect(formatTruncatedBanner(2000)).toBe("Showing first 2,000 spans — trace truncated");
  });

  test("fingerprint stays compact", () => {
    expect(formatFingerprintChip("3e91c0a7deadbeef")).toBe("fp 3e91c0a7");
  });
});
