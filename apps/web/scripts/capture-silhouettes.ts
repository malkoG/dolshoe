import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

import { exceptionTreeStateNames } from "../src/components/exception-tree.states.ts";
import { projectDashboardOverviewStateNames } from "../src/components/project-dashboard-overview.states.ts";
import { investigationStateNames } from "../src/screens/investigation/investigation.states.ts";
import { logsScreenStateNames } from "../src/screens/logs/logs-screen.states.ts";
import { projectSettingsStateNames } from "../src/screens/project-settings/project-settings.states.ts";
import { reportsViewStateNames } from "../src/screens/reports/reports-view.states.ts";
import { tracesScreenStateNames } from "../src/screens/traces/traces-screen.states.ts";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = fileURLToPath(new URL("../.silhouettes", import.meta.url));
const configFile = fileURLToPath(new URL("../vite.ui-review.config.ts", import.meta.url));

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

interface Surface {
  name: string;
  states: readonly string[];
  viewport?: { width: number; height: number };
}

const DEFAULT_VIEWPORT = { width: 1100, height: 720 };

const SURFACES: Surface[] = [
  { name: "exception-tree", states: exceptionTreeStateNames },
  { name: "project-dashboard-overview", states: projectDashboardOverviewStateNames },
  {
    name: "investigation",
    states: investigationStateNames,
    viewport: { width: 1440, height: 1106 },
  },
  {
    name: "traces",
    states: tracesScreenStateNames,
    // Wide enough for Figma 1440×960 plus the review frame's padding.
    viewport: { width: 1600, height: 1120 },
  },
  {
    name: "project-settings",
    states: projectSettingsStateNames,
    viewport: { width: 1440, height: 960 },
  },
  {
    name: "reports",
    states: reportsViewStateNames,
    // Wide enough for Figma 1440×960 plus the review frame's padding.
    viewport: { width: 1600, height: 1120 },
  },
  { name: "logs", states: logsScreenStateNames, viewport: { width: 1440, height: 960 } },
];

/**
 * Photograph each named state of every registered surface.
 *
 * @remarks
 * This is a generator, not a pixel oracle. It writes gitignored PNGs for a
 * reviewer to attach; it does not compare them to a committed golden.
 */
async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  const server = await createServer({ configFile });
  await server.listen();
  const address = server.resolvedUrls?.local[0];
  if (address == null) {
    await server.close();
    throw new Error("The UI review harness did not bind a local URL.");
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    await server.close();
    throw new Error(
      "Playwright could not launch Chromium. From the repository root run `pnpm test:ui:install`, then retry.",
      { cause: error },
    );
  }

  try {
    const page = await browser.newPage({
      viewport: DEFAULT_VIEWPORT,
      deviceScaleFactor: 1,
    });

    for (const surface of SURFACES) {
      await page.setViewportSize(surface.viewport ?? DEFAULT_VIEWPORT);
      for (const name of surface.states) {
        await page.goto(new URL(`/?surface=${surface.name}&state=${name}`, address).href, {
          waitUntil: "networkidle",
        });
        const root = page.locator("[data-review-root]");
        await root.waitFor({ state: "visible" });
        const dest = `${outputDir}/${surface.name}.${name}.png`;
        await root.screenshot({ path: dest, animations: "disabled" });
        say(`Wrote ${dest.slice(webRoot.length)}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
