import "server-only";
import puppeteer, { type Browser } from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "data", "screenshots");

function ensureDir() {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Detect a locally installed Chrome/Chromium on macOS or Linux.
 */
function detectChromePath(): string | null {
  const candidates = [
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  const envPath = process.env.CHROME_PATH;
  if (envPath) return envPath;

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

let browserPromise: Promise<Browser> | null = null;

function launchBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;

  const chromePath = detectChromePath();
  if (!chromePath) {
    return Promise.reject(
      new Error(
        "No Chrome/Chromium found. Set CHROME_PATH env or install Chrome."
      )
    );
  }

  browserPromise = puppeteer
    .launch({
      executablePath: chromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    })
    .catch((err) => {
      browserPromise = null;
      throw err;
    });

  return browserPromise;
}

export type ScreenshotResult = {
  filePath: string;
  filename: string;
  url?: string;
  width: number;
  height: number;
};

async function attachStoredUrl(result: ScreenshotResult): Promise<ScreenshotResult> {
  try {
    const { uploadImageAsset } = await import("@/lib/storage/r2");
    const bytes = await readFile(result.filePath);
    const stored = await uploadImageAsset({
      bytes,
      contentType: "image/png",
      keyPrefix: "images/screenshots",
      sourceName: result.filename,
    });
    return stored?.url ? { ...result, url: stored.url } : result;
  } catch (err) {
    console.warn(
      `[screenshot] R2 upload failed for ${result.filename}: ${
        err instanceof Error ? err.message : err
      }`
    );
    return result;
  }
}

/**
 * Capture a screenshot of a URL and save to data/screenshots/.
 * Returns the local file path and filename.
 */
export async function captureScreenshot(
  url: string,
  options: {
    width?: number;
    height?: number;
    waitMs?: number;
    selector?: string;
    fullPage?: boolean;
  } = {}
): Promise<ScreenshotResult> {
  ensureDir();

  const {
    width = 1280,
    height = 900,
    waitMs = 2000,
    selector,
    fullPage = false,
  } = options;

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15_000 });

    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }

    const filename = `${crypto.randomUUID()}.png`;
    const filePath = path.join(SCREENSHOT_DIR, filename);

    if (selector) {
      const element = await page.$(selector);
      if (element) {
        await element.screenshot({ path: filePath, type: "png" });
        const box = await element.boundingBox();
        return attachStoredUrl({
          filePath,
          filename,
          width: Math.round(box?.width ?? width),
          height: Math.round(box?.height ?? height),
        });
      }
    }

    await page.screenshot({ path: filePath, type: "png", fullPage });
    return attachStoredUrl({ filePath, filename, width, height });
  } finally {
    await page.close();
  }
}

/**
 * Try screenshot, return null on failure (Chrome not installed, timeout, etc.)
 */
export async function captureScreenshotSafe(
  url: string,
  options?: Parameters<typeof captureScreenshot>[1]
): Promise<ScreenshotResult | null> {
  try {
    return await captureScreenshot(url, options);
  } catch (err) {
    console.warn(
      `[screenshot] failed for ${url}: ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}

export function getScreenshotPath(filename: string): string {
  return path.join(SCREENSHOT_DIR, filename);
}

/**
 * Close the shared browser instance (for graceful shutdown).
 */
export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
