import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  platform: null as null | Record<string, unknown>,
  outcome: { status: "refreshed", reason: "ok", nextExpiresAt: "2026-12-01T00:00:00.000Z" } as Record<string, unknown>,
  tenant: { currentWorkspace: { id: "w1" } } as unknown,
}));

vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceManager: vi.fn(async () => state.tenant),
}));
vi.mock("@/db", () => ({
  db: { query: { platforms: { findFirst: vi.fn(async () => state.platform) } } },
}));
vi.mock("@/lib/providers/token-refresh", () => ({
  refreshPlatformConnection: vi.fn(async () => state.outcome),
}));

const call = async () => {
  const { POST } = await import("@/app/api/platforms/[id]/refresh-connection/route");
  return POST(
    new NextRequest("https://smmagent.app/api/platforms/p1/refresh-connection", {
      method: "POST",
      headers: { "x-forwarded-host": "smmagent.app", "x-forwarded-proto": "https" },
    }),
    { params: Promise.resolve({ id: "p1" }) }
  );
};

beforeEach(() => {
  state.platform = { id: "p1", type: "instagram", provider: "direct", workspaceId: "w1" };
  state.outcome = { status: "refreshed", reason: "ok", nextExpiresAt: "2026-12-01T00:00:00.000Z" };
  state.tenant = { currentWorkspace: { id: "w1" } };
  vi.unstubAllEnvs();
});

describe("POST /api/platforms/[id]/refresh-connection", () => {
  it("refreshes a direct Instagram token", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "refreshed" });
  });

  it("asks for browser reauth with the exact redirect uri when the token cannot be refreshed", async () => {
    state.outcome = { status: "failed", reason: "session invalidated", nextExpiresAt: null };
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      status: "reauth_required",
      reconnectUrl: "https://smmagent.app/api/auth/instagram?next=%2Fdashboard%2Fworkspace-settings%2Fsocial-accounts",
      redirectUri: "https://smmagent.app/api/auth/callback",
    });
  });

  it("rejects non-Instagram or non-direct platforms and unknown ids", async () => {
    state.platform = { id: "p1", type: "instagram", provider: "zernio", workspaceId: "w1" };
    expect((await call()).status).toBe(400);
    state.platform = { id: "p1", type: "instagram_personal", provider: "direct", workspaceId: "w1" };
    expect((await call()).status).toBe(400);
    state.platform = null;
    expect((await call()).status).toBe(404);
  });

  it("passes through auth failures (read-only key)", async () => {
    state.tenant = NextResponse.json({ error: "read" }, { status: 403 });
    expect((await call()).status).toBe(403);
  });
});
