import { INestApplication, VERSION_NEUTRAL, VersioningType } from "@nestjs/common";

export function configureApplication(app: INestApplication): void {
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });
  app.enableShutdownHooks();
}
