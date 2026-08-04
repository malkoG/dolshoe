import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from "@nestjs/common";

/**
 * Refuse an OTLP body Dolshoe cannot read, before it fails as something else.
 *
 * @remarks
 * `http/protobuf` is the default protocol for most OpenTelemetry exporters, and
 * the only one `@logtape/otel` speaks over HTTP. Nest parses `application/json`
 * alone, so a protobuf body never becomes an object and would otherwise be
 * rejected as an export missing `resourceSpans` — a message that says nothing
 * about the actual problem. A 415 naming the setting to change is the useful
 * answer.
 */
export function assertOtlpJsonContentType(contentType: string | undefined): void {
  // A media type may carry parameters, as in `application/json; charset=utf-8`.
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (mediaType === "application/json") return;

  throw new UnsupportedMediaTypeException(
    `Dolshoe ingests OTLP as JSON, but the request declared ${
      mediaType === "" ? "no content type" : `"${mediaType}"`
    }. Set OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/json on the exporter.`,
  );
}

/**
 * A guard, not a check inside the handler, because pipes run first: by the time
 * a handler body executes, the validation pipe has already rejected the
 * unparsed body as malformed and the useful error is gone.
 */
@Injectable()
export class OtlpJsonContentTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const contentType = request.headers["content-type"];

    assertOtlpJsonContentType(typeof contentType === "string" ? contentType : undefined);
    return true;
  }
}
