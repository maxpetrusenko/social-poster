import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

let mockSessionEmail = "race@example.com";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({
    id: "session_1",
    email: mockSessionEmail,
    token: "test",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  })),
}));
vi.mock("@/lib/marketing/drip", () => ({
  enqueueDrip: vi.fn(),
}));

let tempDir: string | null = null;

afterEach(() => {
  mockSessionEmail = "race@example.com";
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("tenant initialization", () => {
  it("reuses one default tenant across concurrent first logins", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { getTenantContext } = await import("@/lib/tenancy");
    const now = Date.now();

    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("existing_org_1", "SMM Agent", "smm-agent", "America/New_York", now, now);
    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("existing_org_2", "SMM Agent", "smm-agent-2", "America/New_York", now, now);

    const contexts = await Promise.all([
      getTenantContext(),
      getTenantContext(),
    ]);

    expect(contexts[0]?.organization.id).toBe(contexts[1]?.organization.id);
    expect(contexts[0]?.organization.slug).toBe("smm-agent-3");

    const rows = sqlite
      .prepare(
        `SELECT u.email, o.slug
         FROM org_memberships m
         JOIN users u ON u.id = m.user_id
         JOIN organizations o ON o.id = m.organization_id
         WHERE u.email = ?
         ORDER BY o.slug`
      )
      .all("race@example.com");

    expect(rows).toEqual([{ email: "race@example.com", slug: "smm-agent-3" }]);

    sqlite.close();
  });

  it("creates a default workspace for arbitrary emails despite legacy allowlist envs", async () => {
    mockSessionEmail = "customer@example.com";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.stubEnv("WORKSPACE_ALLOWED_EMAILS", "max.petrusenko@gmail.com");
    vi.stubEnv("WORKSPACE_ALLOWED_DOMAINS", "maxpetrusenko.com");
    vi.stubEnv("SUPABASE_AUTH_ALLOW_ALL_USERS", "false");
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { getTenantContext } = await import("@/lib/tenancy");

    const context = await getTenantContext();

    expect(context?.user.email).toBe("customer@example.com");
    expect(context?.organization.name).toBe("SMM Agent");
    expect(context?.currentWorkspace.slug).toBe("primary-workspace");

    const rows = sqlite
      .prepare(
        `SELECT u.email, o.slug, w.slug AS workspace_slug
         FROM workspace_memberships wm
         JOIN users u ON u.id = wm.user_id
         JOIN workspaces w ON w.id = wm.workspace_id
         JOIN organizations o ON o.id = w.organization_id
         WHERE u.email = ?`
      )
      .all("customer@example.com");

    expect(rows).toEqual([
      {
        email: "customer@example.com",
        slug: "smm-agent",
        workspace_slug: "primary-workspace",
      },
    ]);

    sqlite.close();
  });
});
