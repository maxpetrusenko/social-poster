import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// usage: node scripts/stills.mjs <html> <outdir> <t1,t2,...>
const html = process.argv[2];
const outDir = process.argv[3];
const times = (process.argv[4] ?? "0.1,0.4,0.7,0.95").split(",").map(Number);
const chrome =
  "/Users/maxpetrusenko/.cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.204/chrome-headless-shell-mac-arm64/chrome-headless-shell";

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "shell",
  args: ["--force-device-scale-factor=1", "--hide-scrollbars", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto("file://" + path.resolve(html), { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 500));
for (const t of times) {
  await page.evaluate((v) => window.setT(v), t);
  await new Promise((r) => setTimeout(r, 120));
  const buf = await page.screenshot({ type: "png" });
  const f = path.join(outDir, `t_${String(t).replace(".", "_")}.png`);
  writeFileSync(f, buf);
  console.log(f);
}
await browser.close();
