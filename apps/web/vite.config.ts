import { defineConfig } from "vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";

// Docker Desktop's virtualized filesystem doesn't always deliver fs-change
// events for bind-mounted host edits, so the dev image opts in to polling
// via this env var. Native/CI dev keeps the default event-based watcher.
const usePolling = process.env.VITE_WATCH_USE_POLLING === "true";

// The externally mapped browser port for the HMR websocket, when it differs
// from the port Vite listens on inside the container (set by Compose).
const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
  ? Number(process.env.VITE_HMR_CLIENT_PORT)
  : undefined;

// Compose supplies the API container's address for the dev proxy; requests
// fall through unproxied when it's unset (e.g. running outside Docker).
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET;

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tanstackStart(), viteReact()],
  server: {
    host: true,
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
    hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
    proxy: apiProxyTarget
      ? {
          "/api": {
            target: apiProxyTarget,
            // Deliberately not `changeOrigin`. Rewriting Host to the API's
            // address while the browser's Origin header still names this dev
            // server makes every state-changing request look cross-origin, and
            // the API refuses those. Passing Host through keeps the two in
            // agreement, which is what a single-origin deployment looks like.
            changeOrigin: false,
          },
        }
      : undefined,
  },
});

export default config;
