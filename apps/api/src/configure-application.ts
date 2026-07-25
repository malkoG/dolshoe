import {
  INestApplication,
  PayloadTooLargeException,
  VERSION_NEUTRAL,
  VersioningType,
} from "@nestjs/common";

import { configureOpenApi } from "./openapi/configure-openapi";

interface BodyParserApplication {
  useBodyParser(type: "json", options: { limit: string }): void;
}

function mapBodyParserError(
  error: unknown,
  _request: unknown,
  _response: unknown,
  next: (error: unknown) => void,
): void {
  if (
    error != null &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    next(new PayloadTooLargeException("The JSON request body exceeds 1 MiB."));
    return;
  }
  next(error);
}

export function configureApplication(app: INestApplication): void {
  (app as INestApplication & BodyParserApplication).useBodyParser("json", { limit: "1mb" });
  app.use(mapBodyParserError);
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });
  configureOpenApi(app);
  app.enableShutdownHooks();
}
