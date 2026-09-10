import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Vite config for photographing named states.
 *
 * @remarks
 * The application config pulls in TanStack Start, which is the host a
 * silhouette must not boot. This file is the same React and Tailwind
 * pipeline without the router, the API proxy, or a session.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./src/ui-review", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [tailwindcss(), viteReact()],
  resolve: { tsconfigPaths: true },
  server: {
    host: "127.0.0.1",
    port: 4177,
    strictPort: true,
  },
});
