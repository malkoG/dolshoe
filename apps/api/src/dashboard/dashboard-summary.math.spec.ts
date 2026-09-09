import {
  buildDailyBuckets,
  buildVolumeSeries,
  foldGroupCounts,
  previousWindow,
  summaryWindow,
  sum,
} from "./dashboard-summary.math";

const NOW = new Date("2026-09-09T12:00:00.000Z");

describe("buildDailyBuckets", () => {
  it("returns the requested number of 24-hour buckets, oldest first, ending at now", () => {
    const buckets = buildDailyBuckets(NOW, 3);

    expect(buckets).toEqual([
      { start: new Date("2026-09-06T12:00:00.000Z"), end: new Date("2026-09-07T12:00:00.000Z") },
      { start: new Date("2026-09-07T12:00:00.000Z"), end: new Date("2026-09-08T12:00:00.000Z") },
      { start: new Date("2026-09-08T12:00:00.000Z"), end: new Date("2026-09-09T12:00:00.000Z") },
    ]);
  });

  it("returns no gaps or overlaps between consecutive buckets", () => {
    const buckets = buildDailyBuckets(NOW, 7);

    for (let index = 1; index < buckets.length; index++) {
      expect(buckets[index]!.start).toEqual(buckets[index - 1]!.end);
    }
  });
});

describe("summaryWindow and previousWindow", () => {
  it("cover two adjacent, equal-length windows ending at now", () => {
    const current = summaryWindow(NOW, 7);
    const previous = previousWindow(NOW, 7);

    expect(current).toEqual({
      start: new Date("2026-09-02T12:00:00.000Z"),
      end: new Date("2026-09-09T12:00:00.000Z"),
    });
    expect(previous).toEqual({
      start: new Date("2026-08-26T12:00:00.000Z"),
      end: new Date("2026-09-02T12:00:00.000Z"),
    });
    expect(previous.end).toEqual(current.start);
  });
});

describe("foldGroupCounts", () => {
  it("keys counts by their group", () => {
    expect(
      foldGroupCounts([
        { key: "production", count: 5 },
        { key: "staging", count: 2 },
      ]),
    ).toEqual({ production: 5, staging: 2 });
  });

  it('folds a null key into "unspecified"', () => {
    expect(foldGroupCounts([{ key: null, count: 3 }])).toEqual({ unspecified: 3 });
  });

  it('folds an empty-string key into "unspecified" too', () => {
    expect(foldGroupCounts([{ key: "", count: 1 }])).toEqual({ unspecified: 1 });
  });

  it("sums duplicate keys instead of overwriting", () => {
    expect(
      foldGroupCounts([
        { key: null, count: 2 },
        { key: "", count: 1 },
      ]),
    ).toEqual({ unspecified: 3 });
  });

  it("returns an empty object for no rows", () => {
    expect(foldGroupCounts([])).toEqual({});
  });
});

describe("buildVolumeSeries", () => {
  it("zips each bucket with its error report and log record counts", () => {
    const buckets = buildDailyBuckets(NOW, 2);

    expect(buildVolumeSeries(buckets, [1, 2], [10, 20])).toEqual([
      { bucketStart: buckets[0]!.start.toISOString(), errorReports: 1, logRecords: 10 },
      { bucketStart: buckets[1]!.start.toISOString(), errorReports: 2, logRecords: 20 },
    ]);
  });

  it("defaults a missing count to zero", () => {
    const buckets = buildDailyBuckets(NOW, 2);

    expect(buildVolumeSeries(buckets, [1], [])).toEqual([
      { bucketStart: buckets[0]!.start.toISOString(), errorReports: 1, logRecords: 0 },
      { bucketStart: buckets[1]!.start.toISOString(), errorReports: 0, logRecords: 0 },
    ]);
  });
});

describe("sum", () => {
  it("adds every value", () => {
    expect(sum([1, 2, 3])).toBe(6);
  });

  it("returns zero for an empty array", () => {
    expect(sum([])).toBe(0);
  });
});
