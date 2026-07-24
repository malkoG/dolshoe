import "reflect-metadata";

import { getLogger, reset } from "@logtape/logtape";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { appConfig } from "./config/app-config";
import { configureApplication } from "./configure-application";
import { LogTapeLogger } from "./logging/logtape.logger";
import { setupLogging } from "./logging/setup-logging";

async function bootstrap(): Promise<void> {
  await setupLogging();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(new LogTapeLogger());
  configureApplication(app);

  await app.listen(appConfig.port);

  getLogger(["dolshoe", "bootstrap"]).info("Dolshoe API is listening on port {port}.", {
    port: appConfig.port,
  });
}

void bootstrap().catch(async (error: unknown) => {
  getLogger(["dolshoe", "bootstrap"]).fatal("Dolshoe API failed to start: {error}", { error });
  await reset();
  process.exitCode = 1;
});
