import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

import { errorReportOpenApiSchemas } from "../error-reporting/error-report.contract";
import { logRecordOpenApiSchemas } from "../log-recording/log-record.contract";
import { projectOpenApiSchemas } from "../projects/project.contract";

function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle("Dolshoe API")
    .setDescription(
      "Self-hosted error-report and structured-log ingestion API. Runtime adapters normalize records into versioned contracts.",
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
  };

  return document;
}

export function configureOpenApi(app: INestApplication): void {
  SwaggerModule.setup("docs", app, () => createOpenApiDocument(app), {
    customSiteTitle: "Dolshoe API reference",
    jsonDocumentUrl: "docs/openapi.json",
  });
}
