import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ tenant: null as unknown }));
vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceManager: vi.fn(async () => auth.tenant),
  requireApiWorkspaceManagerWrite: vi.fn(async () => auth.tenant),
}));

let tempDir: string | null = null;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function setup() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-agent-"));
  vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
  vi.resetModules();
  const { db, sqlite } = await import("@/db");
  const schema = await import("@/db/schema");
  const now = new Date();
  await db.insert(schema.organizations).values({ id: "o1", name: "O", slug: "o", createdAt: now, updatedAt: now });
  for (const id of ["w1", "w2"]) {
    await db.insert(schema.workspaces).values({ id, organizationId: "o1", name: id, slug: id, createdAt: now, updatedAt: now });
  }
  await db.insert(schema.platforms).values([
    { id: "ig1", workspaceId: "w1", name: "IG", type: "instagram", provider: "direct", enabled: false, createdAt: now, updatedAt: now },
    { id: "ig2", workspaceId: "w2", name: "IG other", type: "instagram", provider: "direct", enabled: false, createdAt: now, updatedAt: now },
  ]);
  auth.tenant = { currentWorkspace: { id: "w1" }, user: { id: "u1" } };
  return { sqlite };
}

const patch = (body: unknown) =>
  new NextRequest("https://x.test/api", { method: "PATCH", body: JSON.stringify(body) });

describe("PATCH /api/platforms/[id]", () => {
  it("toggles enabled for a platform in the caller's workspace", async () => {
    const { sqlite } = await setup();
    const { PATCH } = await import("@/app/api/platforms/[id]/route");
    const res = await PATCH(patch({ enabled: true }), { params: Promise.resolve({ id: "ig1" }) });
    expect(res.status).toBe(200);
    expect(sqlite.prepare("SELECT enabled FROM platforms WHERE id='ig1'").get()).toEqual({ enabled: 1 });
    sqlite.close();
  });

  it("404s for another workspace's platform and leaves it untouched", async () => {
    const { sqlite } = await setup();
    const { PATCH } = await import("@/app/api/platforms/[id]/route");
    const res = await PATCH(patch({ enabled: true }), { params: Promise.resolve({ id: "ig2" }) });
    expect(res.status).toBe(404);
    expect(sqlite.prepare("SELECT enabled FROM platforms WHERE id='ig2'").get()).toEqual({ enabled: 0 });
    sqlite.close();
  });

  it("rejects non-boolean bodies and returns the auth response unchanged", async () => {
    const { sqlite } = await setup();
    const { PATCH } = await import("@/app/api/platforms/[id]/route");
    expect((await PATCH(patch({ enabled: "yes" }), { params: Promise.resolve({ id: "ig1" }) })).status).toBe(400);
    auth.tenant = NextResponse.json({ error: "no" }, { status: 403 });
    expect((await PATCH(patch({ enabled: true }), { params: Promise.resolve({ id: "ig1" }) })).status).toBe(403);
    sqlite.close();
  });
});

describe("x-likes-autopost setting route", () => {
  it("defaults to the env var and lets a workspace override win, then clear", async () => {
    const { sqlite } = await setup();
    vi.stubEnv("X_LIKES_AUTOPUBLISH_ENABLED", "true");
    vi.stubEnv("X_LIKES_AUTOPUBLISH_MODE", "publish");
    const { GET, PATCH } = await import("@/app/api/settings/x-likes-autopost/route");

    let body = await (await GET()).json();
    expect(body).toMatchObject({ enabled: true, source: "env", envDefault: true, override: null, workerActive: true, latestRun: null });

    body = await (await PATCH(patch({ enabled: false }))).json();
    expect(body).toMatchObject({ enabled: false, source: "workspace", envDefault: true, override: false, workerActive: false });

    body = await (await PATCH(patch({ enabled: null }))).json();
    expect(body).toMatchObject({ enabled: true, source: "env", override: null });
    expect((await PATCH(patch({ enabled: "on" }))).status).toBe(400);
    sqlite.close();
  });
});
