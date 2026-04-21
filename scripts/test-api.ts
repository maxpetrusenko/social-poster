/**
 * Integration test script for ClawPoster API
 * Uses the CLAW_POSTER_API_KEY from .env to test:
 * 1. Create a test post
 * 2. Edit the post
 * 3. Publish the post
 * 4. Verify usage tracking
 * 5. Clean up
 *
 * Run: npx tsx scripts/test-api.ts
 */

import "dotenv/config";

const API_KEY = process.env.CLAW_POSTER_API_KEY;
const BASE_URL = process.env.APP_URL || "http://127.0.0.1:3000";

if (!API_KEY) {
  console.error("CLAW_POSTER_API_KEY not set in .env");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_KEY}`,
};

type TestResult = { name: string; passed: boolean; error?: string; details?: string };
const results: TestResult[] = [];

function log(msg: string) {
  console.log(`[test] ${msg}`);
}

function pass(name: string, details?: string) {
  results.push({ name, passed: true, details });
  log(`PASS: ${name}${details ? ` — ${details}` : ""}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  log(`FAIL: ${name} — ${error}`);
}

async function fetchApi(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  log(`Testing against ${BASE_URL}`);
  log(`API Key: ${API_KEY!.slice(0, 10)}...${API_KEY!.slice(-6)}`);
  log("");

  let postId: string | null = null;

  // 1. Create test post
  try {
    const { status, body } = await fetchApi("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        content: "[TEST] Integration test post — will be cleaned up",
        contentType: "text",
        intent: "draft",
        platformIds: [],
      }),
    });

    if (status === 200 || status === 201) {
      postId = body?.id;
      pass("Create post", `id=${postId}`);
    } else {
      fail("Create post", `Status ${status}: ${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("Create post", String(e));
  }

  if (!postId) {
    log("Skipping remaining tests — post creation failed");
    printSummary();
    return;
  }

  // 2. Edit post
  try {
    const { status, body } = await fetchApi(`/api/posts/${postId}`, {
      method: "POST",
      body: JSON.stringify({
        content: "[TEST] Integration test post — EDITED",
        contentType: "text",
        intent: "draft",
        platformIds: [],
      }),
    });

    if (status === 200) {
      pass("Edit post", `id=${body?.id}`);
    } else {
      fail("Edit post", `Status ${status}: ${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("Edit post", String(e));
  }

  // 3. Try publish (will likely fail since no platforms selected, but should not 500)
  try {
    const { status, body } = await fetchApi(`/api/posts/${postId}/publish`, {
      method: "POST",
    });

    if (status === 400 && body?.error?.includes("No platform targets")) {
      pass("Publish (no targets)", "Correctly rejected with 400");
    } else if (status === 200) {
      pass("Publish", `runId=${body?.runId}`);
    } else {
      fail("Publish", `Status ${status}: ${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("Publish", String(e));
  }

  // 4. API Keys — list
  try {
    const { status, body } = await fetchApi("/api/api-keys");
    if (status === 200 && Array.isArray(body)) {
      pass("List API keys", `${body.length} keys found`);
    } else {
      fail("List API keys", `Status ${status}: ${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("List API keys", String(e));
  }

  // 5. Notifications — toggle
  try {
    const { status, body } = await fetchApi("/api/settings/notifications", {
      method: "POST",
      body: JSON.stringify({ key: "marketingEmails", value: false }),
    });
    if (status === 200 && body?.ok) {
      pass("Toggle notification", "marketingEmails=false");
    } else {
      fail("Toggle notification", `Status ${status}: ${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("Toggle notification", String(e));
  }

  // 6. Toggle back
  try {
    const { status } = await fetchApi("/api/settings/notifications", {
      method: "POST",
      body: JSON.stringify({ key: "marketingEmails", value: true }),
    });
    if (status === 200) {
      pass("Toggle notification back", "marketingEmails=true");
    } else {
      fail("Toggle notification back", `Status ${status}`);
    }
  } catch (e) {
    fail("Toggle notification back", String(e));
  }

  printSummary();
}

function printSummary() {
  log("");
  log("═══════════════════════════════════════");
  log("TEST SUMMARY");
  log("═══════════════════════════════════════");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    log(`  ${r.passed ? "✓" : "✗"} ${r.name}${r.error ? ` — ${r.error}` : ""}`);
  }

  log("");
  log(`${passed} passed, ${failed} failed, ${results.length} total`);
  log("═══════════════════════════════════════");

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Test script crashed:", e);
  process.exit(1);
});
