import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

loadDotenv({
  path: resolve(process.cwd(), "../../.env"),
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.cjs",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://dolshoe:dolshoe@localhost:5432/dolshoe?schema=public",
  },
});
