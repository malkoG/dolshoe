import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Construction tests for public views.
 *
 * @remarks
 * happy-dom is enough to mount a React tree and read the words. It is not
 * a browser, and that is the point: these tests stay in `pnpm check` and
 * must not need Chromium, Compose, or the API.
 */
export default defineConfig({
  plugins: [viteReact()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
