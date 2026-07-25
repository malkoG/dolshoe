import { logRecordBatchRequestSchema, logRecordOpenApiSchemas } from "./log-record.contract";
import { logRecordBatchExample, logRecordExample } from "./log-record.examples";

describe("log record contract", () => {
  it("accepts the documented batch", () => {
    expect(logRecordBatchRequestSchema.parse(logRecordBatchExample)).toEqual(logRecordBatchExample);
  });

  it("rejects duplicate eventIds within one batch", () => {
    const result = logRecordBatchRequestSchema.safeParse({
      schemaVersion: 1,
      records: [logRecordExample, logRecordExample],
    });

    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["records", 1, "eventId"],
          message: "eventId values must be unique within a batch.",
        }),
      ]),
    );
  });

  it("rejects attributes larger than 64 KiB", () => {
    const result = logRecordBatchRequestSchema.safeParse({
      schemaVersion: 1,
      records: [
        {
          ...logRecordExample,
          attributes: {
            oversized: "x".repeat(65_536),
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("publishes log batch schemas for OpenAPI", () => {
    expect(logRecordOpenApiSchemas).toEqual(
      expect.objectContaining({
        LogRecordV1: expect.any(Object),
        LogRecordBatchRequestV1: expect.any(Object),
        LogRecordReceiptV1: expect.any(Object),
        LogRecordBatchReceiptV1: expect.any(Object),
      }),
    );
  });
});
