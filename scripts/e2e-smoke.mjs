import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a TCP port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForServer(baseUrl, child, logs) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next server exited early.\n${logs.join("")}`);
    }

    try {
      const response = await fetch(`${baseUrl}/favicon.ico`);
      if (response.ok) return;
    } catch {
      // Keep polling until Next is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Next server.\n${logs.join("")}`);
}

async function startServer() {
  const port = Number(process.env.E2E_PORT || (await getFreePort()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = await mkdtemp(path.join(tmpdir(), "smmagent-e2e-"));
  const databaseUrl = path.join(dataDir, "social-poster.db");
  const logs = [];
  const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DISABLE_AUTH: "false",
        EMAIL_DELIVERY_MODE: "log",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  await waitForServer(baseUrl, child, logs);

  return {
    baseUrl,
    async stop() {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function fetchBuffer(url, init) {
  const response = await fetch(url, init);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { response, buffer };
}

function expectBytes(buffer, bytes) {
  assert.deepEqual([...buffer.subarray(0, bytes.length)], bytes);
}

const server = await startServer();

try {
  const smmAgentHeaders = { "x-forwarded-host": "smmagent.app" };

  const home = await fetch(`${server.baseUrl}/`, { headers: smmAgentHeaders });
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.match(html, /<title>AI Social Media Agent for Operators — SMM Agent<\/title>/);
  assert.match(html, /property="og:title" content="AI Social Media Agent for Operators — SMM Agent"/);
  assert.match(html, /property="og:image" content="https:\/\/smmagent\.app\/opengraph-image"/);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.doesNotMatch(html, /Max Petrusenko Studio|SMMAgent/);

  const manifestResponse = await fetch(`${server.baseUrl}/site.webmanifest`);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "SMM Agent");
  assert.equal(manifest.short_name, "SMM Agent");
  assert.ok(manifest.icons.some((icon) => icon.src === "/logo-256.png"));

  const favicon = await fetchBuffer(`${server.baseUrl}/favicon.ico`);
  assert.equal(favicon.response.status, 200);
  assert.match(favicon.response.headers.get("content-type") ?? "", /image\/x-icon/);
  expectBytes(favicon.buffer, [0, 0, 1, 0]);

  const openGraphImage = await fetchBuffer(`${server.baseUrl}/opengraph-image`);
  assert.equal(openGraphImage.response.status, 200);
  assert.match(openGraphImage.response.headers.get("content-type") ?? "", /image\/png/);
  expectBytes(openGraphImage.buffer, [0x89, 0x50, 0x4e, 0x47]);

  const twitterImage = await fetchBuffer(`${server.baseUrl}/twitter-image`);
  assert.equal(twitterImage.response.status, 200);
  assert.match(twitterImage.response.headers.get("content-type") ?? "", /image\/png/);
  expectBytes(twitterImage.buffer, [0x89, 0x50, 0x4e, 0x47]);

  const login = await fetch(`${server.baseUrl}/login`);
  const loginHtml = await login.text();
  assert.equal(login.status, 200);
  assert.match(loginHtml, /Continue with Google/);
  assert.doesNotMatch(loginHtml, /Continue to SMM Agent|Max Petrusenko Studio|SMMAgent/);

  console.log("e2e smoke passed");
} finally {
  await server.stop();
}
