import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import puppeteer from "puppeteer-core";

const html = process.argv[2] ?? "motion.html";
const outMp4 = process.argv[3] ?? "motion.mp4";
const seconds = Number(process.argv[4] ?? 7);
const fps = 24;
const chrome =
  "/Users/maxpetrusenko/.cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.204/chrome-headless-shell-mac-arm64/chrome-headless-shell";

const framesDir = path.join(process.cwd(), "frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "shell",
  args: ["--force-device-scale-factor=1", "--hide-scrollbars", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });
await page.goto("file://" + path.resolve(html), { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 400));

const total = Math.round(seconds * fps);
for (let i = 0; i < total; i += 1) {
  const t = i / (total - 1);
  await page.evaluate((v) => window.setT(v), t);
  const buf = await page.screenshot({ type: "png" });
  writeFileSync(path.join(framesDir, `f${String(i).padStart(4, "0")}.png`), buf);
  if (i % 24 === 0) process.stdout.write(`frame ${i}/${total}\n`);
}
await browser.close();

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, "f%04d.png"),
    "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "16",
    "-movflags", "+faststart",
    outMp4,
  ],
  { stdio: "inherit" }
);
console.log("video", outMp4);
