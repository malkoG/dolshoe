import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  jsonLinesFormatter,
} from "@logtape/logtape";

import { appConfig } from "../config/app-config";

export async function setupLogging(): Promise<void> {
  const formatter =
    appConfig.nodeEnvironment === "production" ? jsonLinesFormatter : ansiColorFormatter;

  await configure({
    sinks: {
      console: getConsoleSink({ formatter }),
    },
    loggers: [
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: ["console"],
      },
      {
        category: ["dolshoe"],
        lowestLevel: appConfig.logLevel,
        sinks: ["console"],
      },
    ],
  });
}
