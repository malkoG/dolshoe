import { UnsupportedMediaTypeException } from "@nestjs/common";

import { assertOtlpJsonContentType } from "./otlp-content-type";

describe("assertOtlpJsonContentType", () => {
  it("accepts JSON, with or without parameters", () => {
    expect(() => assertOtlpJsonContentType("application/json")).not.toThrow();
    expect(() => assertOtlpJsonContentType("application/json; charset=utf-8")).not.toThrow();
    expect(() => assertOtlpJsonContentType("Application/JSON")).not.toThrow();
  });

  // The protocol most exporters default to, and the failure an operator is most
  // likely to hit first, so the message has to name the setting that fixes it.
  it("refuses protobuf and says how to change it", () => {
    expect(() => assertOtlpJsonContentType("application/x-protobuf")).toThrow(
      UnsupportedMediaTypeException,
    );
    expect(() => assertOtlpJsonContentType("application/x-protobuf")).toThrow(
      /OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http\/json/,
    );
  });

  it("refuses a request that declared no content type", () => {
    expect(() => assertOtlpJsonContentType(undefined)).toThrow(UnsupportedMediaTypeException);
    expect(() => assertOtlpJsonContentType("")).toThrow(/no content type/);
  });
});
