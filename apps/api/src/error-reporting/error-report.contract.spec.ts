import {
  errorReportRequestSchema,
  errorReportOpenApiSchemas,
  NormalizedException,
} from "./error-report.contract";
import { nodeErrorReportExample, pythonErrorReportExample } from "./error-report.examples";

const withOrigin = (origin: string) =>
  errorReportRequestSchema.safeParse({
    ...nodeErrorReportExample,
    exception: {
      type: "Error",
      frames: [{ fileName: "node:internal/process/task_queues", origin }],
    },
  }).success;

describe("error report contract", () => {
  it.each([nodeErrorReportExample, pythonErrorReportExample])(
    "accepts a documented runtime example",
    (example) => {
      expect(errorReportRequestSchema.parse(example)).toEqual(example);
    },
  );

  it("accepts a JavaScript non-Error thrown value", () => {
    const result = errorReportRequestSchema.safeParse({
      ...nodeErrorReportExample,
      exception: {
        value: {
          type: "string",
          representation: "request aborted",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a frame origin, and only the three the contract names", () => {
    expect(withOrigin("app")).toBe(true);
    expect(withOrigin("dependency")).toBe(true);
    expect(withOrigin("runtime")).toBe(true);
    expect(withOrigin("stdlib")).toBe(false);
  });

  it("still accepts a frame from a reporter that predates origin", () => {
    const result = errorReportRequestSchema.safeParse({
      ...nodeErrorReportExample,
      exception: {
        type: "Error",
        frames: [{ fileName: "/srv/app/order.js", lineNumber: 42, inApp: true }],
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects exception trees deeper than the contract limit", () => {
    const root: NormalizedException = { type: "Error" };
    let current = root;

    for (let depth = 0; depth < 17; depth += 1) {
      current.cause = { type: "Error" };
      current = current.cause;
    }

    const result = errorReportRequestSchema.safeParse({
      ...nodeErrorReportExample,
      exception: root,
    });

    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Exception nesting cannot exceed 16 levels.",
        }),
      ]),
    );
  });

  it("publishes the request, recursive exception, and receipt as OpenAPI schemas", () => {
    expect(errorReportOpenApiSchemas).toEqual(
      expect.objectContaining({
        ErrorReportRequestV1: expect.any(Object),
        NormalizedExceptionV1: expect.any(Object),
        ErrorReportReceiptV1: expect.any(Object),
      }),
    );

    const serializedSchemas = JSON.stringify(errorReportOpenApiSchemas);
    expect(serializedSchemas).toContain("#/components/schemas/NormalizedExceptionV1");
    expect(serializedSchemas).not.toContain('"$id"');
    expect(serializedSchemas).not.toContain('"examples"');
  });
});
