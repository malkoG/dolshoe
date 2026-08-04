import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

import { authOpenApiSchemas } from "../auth/auth.contract";
import { SESSION_COOKIE_NAME } from "../auth/session-cookie";
import { errorReportOpenApiSchemas } from "../error-reporting/error-report.contract";
import { logRecordOpenApiSchemas } from "../log-recording/log-record.contract";
import { organizationOpenApiSchemas } from "../organizations/organization.contract";
import { projectOpenApiSchemas } from "../projects/project.contract";
import { otlpTraceOpenApiSchemas } from "../tracing/otlp-trace.contract";

function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle("Dolshoe API")
    .setDescription(
      "Self-hosted error-report, structured-log, and trace ingestion API. Runtime adapters normalize records into versioned contracts; spans arrive as OTLP/HTTP JSON.",
    )
    .setVersion("1")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "project ingestion token",
      },
      "ingest-token",
    )
    // The other credential system: a browser session, presented as a cookie
    // rather than a header, and never interchangeable with an ingestion token.
    .addCookieAuth(
      SESSION_COOKIE_NAME,
      { type: "apiKey", in: "cookie", name: SESSION_COOKIE_NAME },
      "session",
    )
    .build();

  const document = SwaggerModule.createDocument(app, configuration);

  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ...(errorReportOpenApiSchemas as NonNullable<
      NonNullable<OpenAPIObject["components"]>["schemas"]
    >),
    ...(logRecordOpenApiSchemas as NonNullable<
      NonNullable<OpenAPIObject["components"]>["schemas"]
    >),
    ...(projectOpenApiSchemas as NonNullable<NonNullable<OpenAPIObject["components"]>["schemas"]>),
    ...(authOpenApiSchemas as NonNullable<NonNullable<OpenAPIObject["components"]>["schemas"]>),
    ...(organizationOpenApiSchemas as NonNullable<
      NonNullable<OpenAPIObject["components"]>["schemas"]
    >),
    ...(otlpTraceOpenApiSchemas as NonNullable<
      NonNullable<OpenAPIObject["components"]>["schemas"]
    >),
  };

  return document;
}

export function configureOpenApi(app: INestApplication): void {
  SwaggerModule.setup("docs", app, () => createOpenApiDocument(app), {
    customSiteTitle: "Dolshoe API reference",
    jsonDocumentUrl: "docs/openapi.json",
  });
}
