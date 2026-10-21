import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ig-connect-"));
process.env.DATABASE_URL = path.join(tmpDir, "test.db");
process.env.PLATFORM_INSTAGRAM_APP_ID = "ig-app";
process.env.PLATFORM_INSTAGRAM_APP_SECRET = "ig-secret-value";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceManager: vi.fn().mockResolvedValue({
    currentWorkspace: { id: "ws-1" },
    user: { id: "user-1" },
  }),
}));

type Account = { igId: string; username: string; name: string };
type StoredConfig = {
  authMethod?: string;
  providerProfile?: Record<string, unknown>;
  credentials: { accessToken: string; expiresAt: number };
  disconnectedAt?: unknown;
  connectionIssue?: unknown;
};
const PERSONAL: Account = { igId: "17841401341900143", username: "max.petrusenko", name: "Max" };
const MIAMI: Account = { igId: "17841499999999999", username: "miamicontactimprov", name: "Miami CI" };

let current: Account = PERSONAL;
let meFails = false;
let tokenCounter = 0;
const logs: string[] = [];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const url = new URL(input.toString());
      if (url.hostname === "api.instagram.com") {
        tokenCounter += 1;
        // Documented shape: data array
        return json({ data: [{ access_token: `short-${tokenCounter}-SECRETTOKEN`, user_id: "scoped-1", permissions: "x" }] });
      }
      if (url.pathname === "/access_token") {
        return json({ access_token: `long-${tokenCounter}-SECRETTOKEN`, token_type: "bearer", expires_in: 5_184_000 });
      }
      if (url.pathname.endsWith("/me")) {
        if (meFails) {
          return json({ error: { message: "Unsupported request - method type: get", code: 100 } }, 400);
        }
        return json({
          id: "scoped-1",
          user_id: current.igId,
          username: current.username,
          name: current.name,
          profile_picture_url: "https://cdn.example/a.jpg",
        });
      }
      return json({}, 404);
    })
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function runCallback(nonce: string) {
  const { signOAuthState, encodeNativeOAuthCookie, appendNativeOAuthCookieFlow } = await import(
    "@/lib/providers/oauth-state"
  );
  const { handleNativeOAuthCallback } = await import("@/lib/providers/oauth-callback");
  const state = signOAuthState({
    nonce,
    platform: "instagram",
    // Direct /api/auth/instagram has no methodId; the UI sends instagram_oauth.
    methodId: nonce.startsWith("ui") ? "instagram_oauth" : null,
    next: "/dashboard/workspace-settings/social-accounts",
    timestamp: Date.now(),
  });
  const cookie = appendNativeOAuthCookieFlow(null, {
    nonce,
    codeVerifier: "v",
    redirectUri: "https://smmagent.app/api/auth/callback",
    credentials: null,
    timestamp: Date.now(),
  });
  cookieStore.get.mockReturnValue({ value: encodeNativeOAuthCookie(cookie) });
  const { verifyOAuthState } = await import("@/lib/providers/oauth-state");
  const parsed = verifyOAuthState(state);
  return handleNativeOAuthCallback(
    new NextRequest(`https://smmagent.app/api/auth/callback?code=auth-code-${nonce}&state=${state}`),
    "instagram",
    parsed
  );
}

async function igRows() {
  const { db } = await import("@/db");
  const { platforms } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  return db.select().from(platforms).where(eq(platforms.type, "instagram"));
}

beforeAll(async () => {
  const { db } = await import("@/db");
  const { organizations, workspaces } = await import("@/db/schema");
  const now = new Date();
  await db.insert(organizations).values({ id: "org-1", name: "O", slug: "o", createdAt: now, updatedAt: now });
  await db.insert(workspaces).values({ id: "ws-1", organizationId: "org-1", name: "W", slug: "w", createdAt: now, updatedAt: now });
});

beforeEach(() => {
  current = PERSONAL;
  meFails = false;
  tokenCounter = 0;
  logs.length = 0;
  stubFetch();
  for (const m of ["log", "error", "warn"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" "));
    });
  }
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  const { db } = await import("@/db");
  const { platforms } = await import("@/db/schema");
  await db.delete(platforms);
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("Instagram connect upsert", () => {
  it("one callback creates one row with profile, long-lived token and canonical authMethod", async () => {
    const res = await runCallback("native-1");
    expect(res.headers.get("location")).toContain("connected=instagram");
    const rows = await igRows();
    expect(rows).toHaveLength(1);
    const cfg = rows[0].config as StoredConfig;
    expect(rows[0].accountId).toBe(PERSONAL.igId);
    expect(rows[0].handle).toBe("max.petrusenko");
    expect(cfg.authMethod).toBe("instagram_oauth");
    expect(cfg.providerProfile).toMatchObject({
      platformId: PERSONAL.igId,
      handle: "max.petrusenko",
      name: "Max",
      avatarUrl: "https://cdn.example/a.jpg",
    });
    expect(cfg.credentials.accessToken).toBe("long-1-SECRETTOKEN");
    const days = (cfg.credentials.expiresAt - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(59);
  });

  it("native-start and UI-start callbacks for the same IG user collapse into one row", async () => {
    await runCallback("native-1");
    await runCallback("ui-2");
    const rows = await igRows();
    expect(rows).toHaveLength(1);
    expect((rows[0].config as StoredConfig).credentials.accessToken).toBe("long-2-SECRETTOKEN");
  });

  it("concurrent callbacks for the same IG user produce one row", async () => {
    await Promise.all([runCallback("native-1"), runCallback("ui-2")]);
    expect(await igRows()).toHaveLength(1);
  });

  it("reconnect updates a disconnected row in place and clears connection issue", async () => {
    await runCallback("native-1");
    const { db } = await import("@/db");
    const { platforms } = await import("@/db/schema");
    const [row] = await igRows();
    const { eq } = await import("drizzle-orm");
    await db
      .update(platforms)
      .set({
        config: {
          ...(row.config as object),
          disconnectedAt: "2026-10-01T00:00:00.000Z",
          connectionIssue: { status: "token_expired", reason: "x", at: "2026-10-01T00:00:00.000Z" },
        },
      })
      .where(eq(platforms.id, row.id));

    await runCallback("ui-2");
    const rows = await igRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(row.id);
    const cfg = rows[0].config as StoredConfig;
    expect(cfg.disconnectedAt).toBeUndefined();
    expect(cfg.connectionIssue).toBeUndefined();
    expect(cfg.credentials.accessToken).toBe("long-2-SECRETTOKEN");
  });

  it("a second IG account creates a second row", async () => {
    await runCallback("native-1");
    current = MIAMI;
    await runCallback("ui-2");
    const rows = await igRows();
    expect(rows.map((r) => r.accountId).sort()).toEqual([MIAMI.igId, PERSONAL.igId].sort());
  });

  it("refuses to save when the profile cannot be read, and never logs tokens", async () => {
    meFails = true;
    const res = await runCallback("native-1");
    expect(res.headers.get("location")).toContain("error=");
    expect(await igRows()).toHaveLength(0);
    const all = logs.join("\n") + (res.headers.get("location") ?? "");
    expect(all).not.toContain("SECRETTOKEN");
    expect(all).not.toContain("ig-secret-value");
  });

  it("does not log tokens on success", async () => {
    await runCallback("native-1");
    expect(logs.join("\n")).not.toContain("SECRETTOKEN");
  });
});
