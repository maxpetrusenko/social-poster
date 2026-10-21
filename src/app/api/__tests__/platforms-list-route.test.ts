import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  tenant: null as unknown,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceManager: vi.fn(),
  requireApiWorkspaceManagerRead: vi.fn(async () => state.tenant),
}));
vi.mock("@/lib/platform-connections", () => ({ upsertPlatformConnection: vi.fn() }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => state.rows }) }) }),
  },
}));

const SECRET = "SECRET-TOKEN-VALUE";

describe("GET /api/platforms", () => {
  it("returns only safe fields and never credentials", async () => {
    state.tenant = { currentWorkspace: { id: "w1" } };
    state.rows = [
      {
        id: "a", workspaceId: "w1", name: "IG", type: "instagram", provider: "direct", handle: "max", accountId: "123", enabled: true,
        config: { credentials: { accessToken: SECRET, refreshToken: SECRET, expiresAt: Date.now() - 1000, X_AUTH_TOKEN: SECRET } },
      },
      { id: "b", workspaceId: "w1", name: "X", type: "twitter", provider: "bird", handle: "@m", accountId: null, enabled: false, config: { disconnectedAt: "2026-01-01" } },
      { id: "c", workspaceId: "w1", name: "LI", type: "linkedin_personal", provider: "direct", handle: null, enabled: true, config: { credentials: { accessToken: SECRET, expiresAt: Date.now() + 86_400_000 } } },
    ];
    const { GET } = await import("@/app/api/platforms/route");
    const res = await GET();
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(200);
    expect(text).not.toContain(SECRET);
    expect(text).not.toMatch(/accessToken|refreshToken|X_AUTH_TOKEN|credentials|accountId|config/);
    const { platforms } = JSON.parse(text);
    expect(platforms.map((p: Record<string, unknown>) => p.connectionStatus)).toEqual([
      "token_expired", "disconnected", "connected",
    ]);
    expect(Object.keys(platforms[0]).sort()).toEqual(
      ["connectionStatus", "displayName", "enabled", "id", "provider", "tokenExpiresAt", "type", "username"]
    );
    expect(platforms[2].tokenExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("passes through auth failures", async () => {
    state.tenant = NextResponse.json({ error: "no" }, { status: 401 });
    const { GET } = await import("@/app/api/platforms/route");
    expect((await GET()).status).toBe(401);
  });
});
