import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

import { exceptionTreeStateNames } from "../src/components/exception-tree.states.ts";
import { projectDashboardOverviewStateNames } from "../src/components/project-dashboard-overview.states.ts";
import { investigationStateNames } from "../src/screens/investigation/investigation.states.ts";
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
}

const SURFACES: Surface[] = [
  { name: "exception-tree", states: exceptionTreeStateNames },
  { name: "project-dashboard-overview", states: projectDashboardOverviewStateNames },
  { name: "investigation", states: investigationStateNames },
  { name: "traces", states: tracesScreenStateNames },
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
      viewport: { width: 1100, height: 720 },
      deviceScaleFactor: 1,
    });

    for (const surface of SURFACES) {
      if (surface.name === "investigation") {
        await page.setViewportSize({ width: 1440, height: 1106 });
      } else {
        await page.setViewportSize({ width: 1100, height: 720 });
      }

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
