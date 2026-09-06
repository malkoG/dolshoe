import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

import { exceptionTreeStateNames } from "../src/components/exception-tree.states.ts";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = fileURLToPath(new URL("../.silhouettes", import.meta.url));
const configFile = fileURLToPath(new URL("../vite.ui-review.config.ts", import.meta.url));

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * Photograph each named state of the exception tree.
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

    for (const name of exceptionTreeStateNames) {
      await page.goto(new URL(`/?state=${name}`, address).href, {
        waitUntil: "networkidle",
      });
      const root = page.locator("[data-review-root]");
      await root.waitFor({ state: "visible" });
      const dest = `${outputDir}/exception-tree.${name}.png`;
      await root.screenshot({ path: dest, animations: "disabled" });
      say(`Wrote ${dest.slice(webRoot.length)}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
