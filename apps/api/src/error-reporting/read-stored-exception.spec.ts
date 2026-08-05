import { errorReportDetailSchema } from "./error-report.contract";
import { readStoredException } from "./read-stored-exception";

describe("readStoredException", () => {
  it("keeps every frame and its origin", () => {
    const exception = readStoredException({
      type: "TypeError",
      message: "Cannot read properties of undefined",
      stacktrace: "TypeError: Cannot read properties of undefined\n    at submitOrder …",
      frames: [
        {
          functionName: "submitOrder",
          fileName: "/srv/app/order.ts",
          lineNumber: 42,
          columnNumber: 18,
          inApp: true,
          origin: "app",
        },
        {
          functionName: "run",
          fileName: "node:internal/process/task_queues",
          lineNumber: 105,
          columnNumber: 5,
          inApp: false,
          origin: "runtime",
        },
      ],
    });

    expect(exception.frames).toHaveLength(2);
    expect(exception.frames?.[1]).toMatchObject({
      fileName: "node:internal/process/task_queues",
      origin: "runtime",
      inApp: false,
    });
    expect(exception.stacktrace).toContain("TypeError");
  });

  it("walks the whole chain: cause, context, and grouped children", () => {
    const exception = readStoredException({
      type: "ExceptionGroup",
      children: [
        { type: "TimeoutError", frames: [{ functionName: "charge" }] },
        { type: "ValueError" },
      ],
      cause: { type: "ConnectionError", cause: { type: "OSError" } },
      context: { type: "KeyError" },
    });

    expect(exception.children?.map((child) => child.type)).toEqual(["TimeoutError", "ValueError"]);
    expect(exception.cause?.cause?.type).toBe("OSError");
    expect(exception.context?.type).toBe("KeyError");
  });

  it("drops keys the contract does not know, because the response is strict", () => {
    const exception = readStoredException({
      type: "ValueError",
      fingerprint: "something a later reporter invented",
      frames: [{ functionName: "handle", vendorSpecific: true }],
    });

    expect(exception).not.toHaveProperty("fingerprint");
    expect(exception.frames?.[0]).not.toHaveProperty("vendorSpecific");
    // And what it produces still satisfies the schema it will be serialized
    // through, which is the whole point of reading defensively.
    expect(errorReportDetailSchema.shape.exception.safeParse(exception).success).toBe(true);
  });

  it("re-applies the bounds rather than trusting what was stored", () => {
    const exception = readStoredException({
      type: "RecursionError",
      frames: Array.from({ length: 500 }, (_, index) => ({ functionName: `frame${index}` })),
      children: Array.from({ length: 50 }, () => ({ type: "ValueError" })),
    });

    expect(exception.frames).toHaveLength(200);
    expect(exception.children).toHaveLength(20);
  });

  it("stops descending a chain deeper than the contract allows", () => {
    let stored: Record<string, unknown> = { type: "Deepest" };
    for (let depth = 0; depth < 40; depth += 1) {
      stored = { type: `Level${depth}`, cause: stored };
    }

    let exception = readStoredException(stored);
    let depth = 0;
    while (exception.cause !== undefined) {
      exception = exception.cause;
      depth += 1;
    }

    expect(depth).toBeLessThanOrEqual(17);
  });

  it("returns an empty exception for JSON that is not an object", () => {
    expect(readStoredException(null)).toEqual({});
    expect(readStoredException("boom")).toEqual({});
    expect(readStoredException([1, 2, 3])).toEqual({});
  });

  it("ignores malformed frame fields instead of passing them through", () => {
    const exception = readStoredException({
      type: "ValueError",
      frames: [
        { functionName: "ok" },
        "not a frame",
        { lineNumber: -1, columnNumber: -1, origin: "somewhere-else", inApp: "yes" },
      ],
    });

    expect(exception.frames).toEqual([{ functionName: "ok" }]);
  });

  it("preserves a thrown non-exception value", () => {
    expect(
      readStoredException({ value: { type: "string", representation: '"plain rejection"' } }).value,
    ).toEqual({ type: "string", representation: '"plain rejection"' });
  });
});
