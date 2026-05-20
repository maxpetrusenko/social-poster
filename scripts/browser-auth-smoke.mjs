import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
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
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
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

async function assertAsset(page, pathname, expectedType, expectedBytes) {
  const result = await page.evaluate(
    async ({ assetPathname }) => {
      const response = await fetch(assetPathname);
      const bytes = [...new Uint8Array(await response.arrayBuffer()).slice(0, 4)];
      return {
        ok: response.ok,
        contentType: response.headers.get("content-type") ?? "",
        bytes,
      };
    },
    { assetPathname: pathname }
  );

  assert.equal(result.ok, true);
  assert.match(result.contentType, expectedType);
  assert.deepEqual(result.bytes, expectedBytes);
}

function seedComposerPlatforms(dbPath, email) {
  const db = new Database(dbPath);
  const now = Date.now();

  try {
    const workspace = db
      .prepare(
        `SELECT w.id
         FROM workspace_memberships wm
         JOIN users u ON u.id = wm.user_id
         JOIN workspaces w ON w.id = wm.workspace_id
         WHERE u.email = ?`
      )
      .get(email);

    if (!workspace?.id) {
      throw new Error(`No workspace found for ${email}.`);
    }

    const insert = db.prepare(
      `INSERT INTO platforms (
        id, workspace_id, name, type, handle, account_id, provider, config, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const platform of [
      ["smoke-x", "X Smoke", "x", "@smoke", "x-smoke", "direct", "{\"capabilities\":[\"text\",\"image\",\"video\",\"schedule\"]}"],
      ["smoke-ig", "Instagram Smoke", "instagram_personal", "@smoke", "ig-smoke", "direct", "{malformed-json"],
      ["smoke-fb", "Facebook Smoke", "facebook", "smoke", "fb-smoke", "direct", null],
      ["smoke-li", "LinkedIn Smoke", "linkedin", "smoke", "li-smoke", "direct", null],
    ]) {
      insert.run(
        platform[0],
        workspace.id,
        platform[1],
        platform[2],
        platform[3],
        platform[4],
        platform[5],
        platform[6],
        1,
        now,
        now
      );
    }
  } finally {
    db.close();
  }
}

function clearMalformedComposerPlatformConfig(dbPath) {
  const db = new Database(dbPath);
  try {
    db.prepare("UPDATE platforms SET config = NULL WHERE id = ?").run("smoke-ig");
  } finally {
    db.close();
  }
}

function encodeSupabaseSessionCookie(session) {
  return `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
}

function createSupabaseUser(email) {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: now,
    phone: "",
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { email, email_verified: true, name: "Browser Internal" },
    created_at: now,
    updated_at: now,
  };
}

function startFakeSupabaseAuth(email) {
  const requests = [];

  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization ?? "",
      });

      if (request.method === "GET" && request.url === "/auth/v1/user") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ user: createSupabaseUser(email) }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Fake Supabase auth server did not bind to a TCP port."));
        return;
      }

      resolve({
        requests,
        url: `http://127.0.0.1:${address.port}`,
        async close() {
          await new Promise((closeResolve) => server.close(closeResolve));
        },
      });
    });
  });
}

async function stopProcess(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function assertSupabaseInternalUrlBrowserFlow(browser) {
  const email = "browser-internal@example.com";
  const fakeSupabase = await startFakeSupabaseAuth(email);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-internal-"));
  const dbPath = path.join(tempDir, "internal.db");
  const logs = [];
  const server = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUTH_EMAIL: email,
        DATABASE_URL: dbPath,
        DISABLE_AUTH: "false",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.maxpetrusenko.com",
        SUPABASE_INTERNAL_URL: fakeSupabase.url,
      },
      detached: true,
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

  let page;
  try {
    await waitForServer(baseUrl);
    page = await browser.newPage();
    const user = createSupabaseUser(email);
    await page.setCookie({
      name: "sb-supabase-auth-token",
      value: encodeSupabaseSessionCookie({
        access_token: "browser-access-token",
        refresh_token: "browser-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user,
      }),
      url: baseUrl,
      path: "/",
    });

    const response = await page.goto(`${baseUrl}/dashboard`, {
      waitUntil: "networkidle0",
      timeout: 120_000,
    });
    const body = await page.evaluate(() => document.body.innerText);

    assert.ok(response);
    assert.equal(response.status(), 200);
    assert.match(body, /Connected accounts/);
    assert.ok(
      fakeSupabase.requests.some(
        (request) =>
          request.url === "/auth/v1/user" &&
          request.authorization === "Bearer browser-access-token"
      ),
      "Dashboard auth did not call the internal Supabase URL."
    );
  } catch (error) {
    console.error(logs.join(""));
    throw error;
  } finally {
    if (page) await page.close();
    await stopProcess(server);
    await fakeSupabase.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
      detached: true,
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
      protocolTimeout: 120_000,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const marketingPage = await browser.newPage();
    await marketingPage.setExtraHTTPHeaders({ "x-forwarded-host": "smmagent.app" });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await marketingPage.setViewport(viewport);
      await marketingPage.goto(`${baseUrl}/`, {
        waitUntil: "networkidle0",
        timeout: 120_000,
      });

      const metadata = await marketingPage.evaluate(() => ({
        title: document.title,
        body: document.body.innerText,
        manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
        shortcutIcon: document.querySelector('link[rel="shortcut icon"]')?.getAttribute("href"),
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
        twitterImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
      }));

      assert.equal(metadata.title, "AI Social Media Agent for Operators — SMM Agent");
      assert.match(metadata.body, /SMM Agent/);
      assert.equal(metadata.manifest, "/site.webmanifest");
      assert.equal(metadata.shortcutIcon, "/favicon.ico");
      assert.equal(metadata.ogImage, "https://smmagent.app/opengraph-image");
      assert.equal(metadata.twitterImage, "https://smmagent.app/opengraph-image");
      assert.doesNotMatch(metadata.body, /Max Petrusenko Studio|SMMAgent/);
    }

    await assertAsset(marketingPage, "/favicon.ico", /image\/x-icon/, [0, 0, 1, 0]);
    await assertAsset(marketingPage, "/opengraph-image", /image\/png/, [
      0x89,
      0x50,
      0x4e,
      0x47,
    ]);
    await assertAsset(marketingPage, "/twitter-image", /image\/png/, [
      0x89,
      0x50,
      0x4e,
      0x47,
    ]);
    await marketingPage.close();

    const pages = await Promise.all([browser.newPage(), browser.newPage()]);
    await Promise.all(
      pages.map((page) =>
        page.evaluateOnNewDocument(() => {
          window.localStorage.setItem(
            "smmagent.uiPreferences",
            JSON.stringify({ productMode: "agentic" })
          );
        })
      )
    );
    const responses = await Promise.all(
      pages.map((page) =>
        page.goto(`${baseUrl}/dashboard`, {
          waitUntil: "networkidle0",
          timeout: 120_000,
        })
      )
    );

    await Promise.all(
      pages.map((page) =>
        page.waitForFunction(
          () => window.localStorage.getItem("smmagent.uiPreferences") === null,
          { timeout: 30_000 }
        )
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
      if (!body.includes("Home") || !body.includes("Social Accounts")) {
        throw new Error(
          `Dashboard page ${index + 1} did not render the default SaaS navigation.\n${body.slice(0, 1000)}`
        );
      }
      if (body.includes("Review")) {
        throw new Error(
          `Dashboard page ${index + 1} rendered agentic navigation by default.`
        );
      }
    });

    const stalePreferenceStates = await Promise.all(
      pages.map((page) =>
        page.evaluate(() => window.localStorage.getItem("smmagent.uiPreferences"))
      )
    );
    stalePreferenceStates.forEach((value, index) => {
      if (value !== null) {
        throw new Error(
          `Dashboard page ${index + 1} did not clear stale agentic preferences.`
        );
      }
    });

    seedComposerPlatforms(dbPath, "browser-race@example.com");

    const createPostPage = pages[0];
    const createPostResponse = await createPostPage.goto(
      `${baseUrl}/dashboard/posts/create`,
      {
        waitUntil: "networkidle0",
        timeout: 120_000,
      }
    );
    assert.ok(createPostResponse);
    assert.equal(createPostResponse.status(), 200);
    const rssButtonState = await createPostPage.evaluate(() => {
      const button = document.querySelector(
        'button[aria-label="Add an RSS source first"]'
      );
      return {
        found: Boolean(button),
        disabled: button instanceof HTMLButtonElement ? button.disabled : false,
        body: document.body.innerText,
      };
    });
    assert.equal(rssButtonState.found, true);
    assert.equal(rssButtonState.disabled, true);
    assert.doesNotMatch(rssButtonState.body, /Application error/);
    assert.match(rssButtonState.body, /Create Post/);
    assert.match(rssButtonState.body, /Instagram Personal \/ Relay/);
    assert.match(rssButtonState.body, /Facebook/);
    assert.match(rssButtonState.body, /LinkedIn/);
    clearMalformedComposerPlatformConfig(dbPath);

    for (const label of [
      "Select X",
      "Select Instagram Personal / Relay",
      "Select Facebook",
      "Select LinkedIn",
    ]) {
      await createPostPage.evaluate((buttonLabel) => {
        const button = document.querySelector(
          `button[aria-label="${buttonLabel}"]`
        );
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error(`Missing platform button: ${buttonLabel}`);
        }
        button.click();
      }, label);
    }

    await createPostPage.type("textarea", "Browser smoke draft across connected platforms.");
    await createPostPage.evaluate(() => {
      const draftButton = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === "Draft"
      );
      if (draftButton instanceof HTMLButtonElement) draftButton.click();
    });
    await createPostPage.evaluate(() => {
      const submit = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === "save draft"
      );
      if (submit instanceof HTMLButtonElement) submit.click();
    });
    await createPostPage.waitForFunction(
      () => window.location.pathname.startsWith("/dashboard/posts/"),
      { timeout: 30_000 }
    );

    const rssPage = pages[1];
    const rssResponse = await rssPage.goto(`${baseUrl}/dashboard/rss`, {
      waitUntil: "networkidle0",
      timeout: 120_000,
    });
    assert.ok(rssResponse);
    assert.equal(rssResponse.status(), 200);
    let rssBody = await rssPage.evaluate(() => document.body.innerText);
    assert.match(rssBody, /No RSS feeds added yet/);

    await rssPage.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.includes("Selection Logic")
      );
      if (button instanceof HTMLButtonElement) button.click();
    });
    rssBody = await rssPage.evaluate(() => document.body.innerText);
    assert.match(rssBody, /No RSS candidates yet/);

    await rssPage.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.includes("Writing Skill")
      );
      if (button instanceof HTMLButtonElement) button.click();
    });
    rssBody = await rssPage.evaluate(() => document.body.innerText);
    assert.match(rssBody, /No selected candidates yet/);

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

      const rssCounts = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM rss_sources) AS sources,
            (SELECT COUNT(*) FROM rss_settings) AS settings,
            (SELECT COUNT(*) FROM drip_queue) AS drip`
        )
        .get();
      assert.deepEqual(rssCounts, { sources: 0, settings: 0, drip: 0 });

      const draftTargets = db
        .prepare(
          `SELECT p.status, COUNT(pt.id) AS targets
           FROM posts p
           LEFT JOIN post_targets pt ON pt.post_id = p.id
           WHERE p.content = ?
           GROUP BY p.status`
        )
        .get("Browser smoke draft across connected platforms.");
      assert.deepEqual(draftTargets, { status: "draft", targets: 4 });
    } finally {
      db.close();
    }

    await assertSupabaseInternalUrlBrowserFlow(browser);

    console.log("browser auth smoke passed");
  } catch (error) {
    console.error(logs.join(""));
    throw error;
  } finally {
    if (browser) await browser.close();
    await stopProcess(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
