import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({
  path: resolve(process.cwd(), "../../.env"),
  quiet: true,
});

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warning", "error", "fatal"]).default("info"),
    INGEST_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).default(14),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
        "DATABASE_URL must be a PostgreSQL URL",
      ),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && environment.INGEST_TOKEN == null) {
      context.addIssue({
        code: "custom",
        message: "INGEST_TOKEN is required in production.",
        path: ["INGEST_TOKEN"],
      });
    }
  });

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsedEnvironment.error)}`);
}

export const appConfig = {
  nodeEnvironment: parsedEnvironment.data.NODE_ENV,
  port: parsedEnvironment.data.PORT,
  logLevel: parsedEnvironment.data.LOG_LEVEL,
  ingestToken: parsedEnvironment.data.INGEST_TOKEN,
  logRetentionDays: parsedEnvironment.data.LOG_RETENTION_DAYS,
  databaseUrl: parsedEnvironment.data.DATABASE_URL,
} as const;
