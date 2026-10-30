import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import puppeteer from "puppeteer-core";

const cacheDir = path.join(os.homedir(), ".cache/puppeteer");
const shellDir = path.join(cacheDir, "chrome-headless-shell");
function findShell(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findShell(p);
      if (nested) return nested;
    } else if (entry.name === "chrome-headless-shell") return p;
  }
  return null;
}
const executablePath = findShell(shellDir);

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { margin: 0 }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1600px; height:2000px; background:#0A0A0A; color:#F5F5F2;
    font-family:-apple-system,"SF Pro Display","Helvetica Neue",Inter,sans-serif;
    display:flex; flex-direction:column; justify-content:space-between;
    padding:120px 130px 170px;
  }
  .label { font-size:38px; letter-spacing:.34em; text-transform:uppercase; color:#8A8A85; }
  h1 { font-size:118px; line-height:1.06; letter-spacing:-0.035em; font-weight:600; margin-top:54px; }
  h1 em { font-style:normal; color:#9BE8B4; }
  .rows { display:flex; flex-direction:column; gap:44px; margin-top:90px; }
  .row { display:grid; grid-template-columns:400px 1fr; align-items:baseline; gap:44px; border-top:1px solid #232323; padding-top:34px; }
  .n { font-size:82px; font-weight:600; letter-spacing:-0.03em; white-space:nowrap; }
  .d { font-size:40px; line-height:1.35; color:#B8B8B2; max-width:820px; }
  footer { display:flex; justify-content:space-between; align-items:baseline; font-size:34px; color:#6E6E69; letter-spacing:.02em; }
</style></head>
<body>
  <div>
    <div class="label">mistral large 4 · open weights</div>
    <h1>the price cut is the release,<br><em>not the benchmark lead</em></h1>
    <div class="rows">
      <div class="row"><div class="n">48%</div><div class="d">coding agent index — effectively tied with GLM-5.3</div></div>
      <div class="row"><div class="n">47%</div><div class="d">fewer tokens per task on average</div></div>
      <div class="row"><div class="n">$0.7 / $2.1</div><div class="d">per million tokens, down from $1.36 / $4.18 at preview</div></div>
    </div>
  </div>
  <footer><span>cost per completed task is the axis now</span><span>petrusenko_max</span></footer>
</body></html>`;

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 2000, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 400));
const out = path.join(os.homedir(), ".hermes/cache/scratch/social-poster/testpost-card.png");
await page.screenshot({ path: out, type: "png" });
await browser.close();
const stat = fs.statSync(out);
console.log(JSON.stringify({ out, bytes: stat.size }, null, 2));
