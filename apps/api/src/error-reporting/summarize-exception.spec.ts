import { summarizeException } from "./summarize-exception";

describe("summarizeException", () => {
  it("extracts type, message, and the exception's own source location", () => {
    expect(
      summarizeException({
        type: "TypeError",
        message: "Cannot read properties of undefined",
        source: {
          fileName: "order.ts",
          lineNumber: 42,
          columnNumber: 18,
          functionName: "submitOrder",
        },
        frames: [{ fileName: "should-be-ignored.ts", lineNumber: 1 }],
      }),
    ).toEqual({
      type: "TypeError",
      message: "Cannot read properties of undefined",
      source: {
        fileName: "order.ts",
        lineNumber: 42,
        columnNumber: 18,
        functionName: "submitOrder",
      },
    });
  });

  it("falls back to the first stack frame when no source is attached to the exception", () => {
    expect(
      summarizeException({
        type: "TimeoutError",
        frames: [
          { functionName: "settle_invoice", fileName: "settle.py", lineNumber: 73 },
          { functionName: "charge", fileName: "processor.py", lineNumber: 12 },
        ],
      }),
    ).toEqual({
      type: "TimeoutError",
      message: undefined,
      source: { functionName: "settle_invoice", fileName: "settle.py", lineNumber: 73 },
    });
  });

  it("omits source when neither the exception nor its first frame carries location data", () => {
    expect(
      summarizeException({
        type: "ExceptionGroup",
        message: "settlement failures (2 sub-exceptions)",
      }),
    ).toEqual({
      type: "ExceptionGroup",
      message: "settlement failures (2 sub-exceptions)",
      source: undefined,
    });
  });

  it("returns an empty summary for non-object exception JSON without throwing", () => {
    expect(summarizeException(null)).toEqual({
      type: undefined,
      message: undefined,
      source: undefined,
    });
    expect(summarizeException("boom")).toEqual({
      type: undefined,
      message: undefined,
      source: undefined,
    });
    expect(summarizeException(undefined)).toEqual({
      type: undefined,
      message: undefined,
      source: undefined,
    });
    expect(summarizeException([1, 2, 3])).toEqual({
      type: undefined,
      message: undefined,
      source: undefined,
    });
  });

  it("ignores malformed field types and out-of-range numbers", () => {
    expect(
      summarizeException({
        type: 12345,
        message: { nested: true },
        source: { fileName: "", lineNumber: -1, columnNumber: -1, functionName: "  " },
      }),
    ).toEqual({ type: undefined, message: undefined, source: undefined });
  });
});
