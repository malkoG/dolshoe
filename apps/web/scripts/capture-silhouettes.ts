import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

import { screenshotOf, SURFACES, viewportFor } from "../src/ui-review/surfaces.ts";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = fileURLToPath(new URL("../.silhouettes", import.meta.url));
const configFile = fileURLToPath(new URL("../vite.ui-review.config.ts", import.meta.url));

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * Photograph each named state of every registered surface.
 *
 * @remarks
 * This is a generator, not a pixel oracle. It writes gitignored PNGs for a
 * reviewer to attach; it does not compare them to a committed golden.
 * Viewports come from `surfaces.ts` so they stay locked to the same paper
 * the harness mounts.
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
      for (const name of surface.states) {
        await page.setViewportSize(viewportFor(surface, name));
        await page.goto(new URL(`/?surface=${surface.name}&state=${name}`, address).href, {
          waitUntil: "networkidle",
        });
        const root = page.locator("[data-review-root]");
        await root.waitFor({ state: "visible" });
        const dest = `${outputDir}/${surface.name}.${name}.png`;
        if (screenshotOf(surface) === "page") {
          await page.screenshot({ path: dest, animations: "disabled" });
        } else {
          await root.screenshot({ path: dest, animations: "disabled" });
        }
        say(`Wrote ${dest.slice(webRoot.length)}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
