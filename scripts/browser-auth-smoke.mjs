import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import puppeteer from "puppeteer-core";

const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);

function findChrome() {
  return chromeCandidates.find((candidate) => fs.existsSync(candidate));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Failed to allocate a port."));
      });
    });
  });
}

async function waitForServer(baseUrl, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Next server did not become ready: ${
      lastError instanceof Error ? lastError.message : "timeout"
    }`
  );
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      "No browser executable found. Set PUPPETEER_EXECUTABLE_PATH to run browser auth smoke tests."
    );
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-browser-"));
  const dbPath = path.join(tempDir, "browser.db");
  const logs = [];

  const server = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTH_EMAIL: "browser-race@example.com",
        DATABASE_URL: dbPath,
        DISABLE_AUTH: "true",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        NEXT_PUBLIC_SUPABASE_URL: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const capture = (chunk) => {
    logs.push(chunk.toString());
    if (logs.join("").length > 20_000) {
      logs.splice(0, logs.length - 20);
    }
  };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);

  let browser;
  try {
    await waitForServer(baseUrl);
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const pages = await Promise.all([browser.newPage(), browser.newPage()]);
    const responses = await Promise.all(
      pages.map((page) =>
        page.goto(`${baseUrl}/dashboard`, {
          waitUntil: "networkidle0",
          timeout: 120_000,
        })
      )
    );

    const bodies = await Promise.all(
      pages.map((page) => page.evaluate(() => document.body.innerText))
    );

    responses.forEach((response, index) => {
      if (!response || response.status() >= 500) {
        throw new Error(
          `Dashboard page ${index + 1} failed with status ${
            response?.status() ?? "none"
          }`
        );
      }
    });

    bodies.forEach((body, index) => {
      if (body.includes("Application error")) {
        throw new Error(`Dashboard page ${index + 1} rendered an app error.`);
      }
      if (!body.includes("Connected accounts")) {
        throw new Error(
          `Dashboard page ${index + 1} did not render dashboard content.`
        );
      }
    });

    const db = new Database(dbPath);
    try {
      const memberships = db
        .prepare(
          `SELECT u.email, o.slug, w.slug AS workspaceSlug
           FROM workspace_memberships wm
           JOIN users u ON u.id = wm.user_id
           JOIN workspaces w ON w.id = wm.workspace_id
           JOIN organizations o ON o.id = w.organization_id
           WHERE u.email = ?
           ORDER BY o.slug`
        )
        .all("browser-race@example.com");

      if (memberships.length !== 1) {
        throw new Error(
          `Expected one browser-created tenant, found ${memberships.length}.`
        );
      }

      const [membership] = memberships;
      if (
        membership.email !== "browser-race@example.com" ||
        membership.slug !== "smm-agent" ||
        membership.workspaceSlug !== "primary-workspace"
      ) {
        throw new Error(
          `Unexpected browser-created tenant: ${JSON.stringify(membership)}`
        );
      }
    } finally {
      db.close();
    }

    console.log("browser auth smoke passed");
  } catch (error) {
    console.error(logs.join(""));
    throw error;
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
