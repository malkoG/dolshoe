/**
 * The snippet Figma paints on the empty Reports screen, using the real Node
 * package rather than the board's `@dolshoe/sdk` stand-in.
 */
export const REPORTS_SETUP_SNIPPET = `import * as Dolshoe from "@dolshoe/node";

Dolshoe.init({
  dsn: process.env.DOLSHOE_DSN,
  service: { name: "checkout-api", environment: "production" },
});

Dolshoe.captureException(new Error("Checkout failed"));`;
