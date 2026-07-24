import { INestApplication, VERSION_NEUTRAL, VersioningType } from "@nestjs/common";

import { configureOpenApi } from "./openapi/configure-openapi";

export function configureApplication(app: INestApplication): void {
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });
  configureOpenApi(app);
  app.enableShutdownHooks();
}
