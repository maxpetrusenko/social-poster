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
        `SELECT
           u.email,
           o.slug,
           w.slug AS workspace_slug,
           w.description,
           w.timezone,
           w.primary_color,
           w.secondary_color,
           w.default_hashtags
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
        description: "",
        timezone: "",
        primary_color: "",
        secondary_color: "",
        default_hashtags: null,
      },
    ]);

    const dripCount = sqlite
      .prepare("SELECT COUNT(*) AS count FROM drip_queue")
      .get();
    expect(dripCount).toEqual({ count: 0 });

    sqlite.close();
  });

  it("does not attach legacy unscoped records to a fresh tenant", async () => {
    mockSessionEmail = "fresh@example.com";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { getTenantContext } = await import("@/lib/tenancy");
    const now = Date.now();

    sqlite
      .prepare(
        `INSERT INTO platforms (id, name, type, provider, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("legacy_platform", "Legacy X", "x", "zernio", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO profiles (id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      )
      .run("legacy_profile", "Legacy Profile", now, now);
    sqlite
      .prepare(
        `INSERT INTO posts (id, content, content_type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("legacy_post", "Legacy post", "text", "draft", now, now);
    sqlite
      .prepare(
        `INSERT INTO schedules (id, name, cron, job_type, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("legacy_schedule", "Legacy Schedule", "0 9 * * *", "text_post", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO pipeline_runs (id, trigger, status, started_at)
         VALUES (?, ?, ?, ?)`
      )
      .run("legacy_run", "manual", "completed", now);
    sqlite
      .prepare(
        `INSERT INTO reply_candidates (id, tweet_id, tweet_url, author_handle, tweet_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "legacy_candidate",
        "tweet_1",
        "https://x.com/example/status/1",
        "example",
        "Legacy candidate",
        now,
        now
      );
    sqlite
      .prepare(
        `INSERT INTO reply_events (id, tweet_url, author_handle, lane, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "legacy_event",
        "https://x.com/example/status/2",
        "example",
        "priority",
        "sent",
        now
      );

    const context = await getTenantContext();
    expect(context?.user.email).toBe("fresh@example.com");

    const rows = sqlite
      .prepare(
        `SELECT 'platforms' AS table_name, workspace_id FROM platforms WHERE id = 'legacy_platform'
         UNION ALL SELECT 'profiles', workspace_id FROM profiles WHERE id = 'legacy_profile'
         UNION ALL SELECT 'posts', workspace_id FROM posts WHERE id = 'legacy_post'
         UNION ALL SELECT 'schedules', workspace_id FROM schedules WHERE id = 'legacy_schedule'
         UNION ALL SELECT 'pipeline_runs', workspace_id FROM pipeline_runs WHERE id = 'legacy_run'
         UNION ALL SELECT 'reply_candidates', workspace_id FROM reply_candidates WHERE id = 'legacy_candidate'
         UNION ALL SELECT 'reply_events', workspace_id FROM reply_events WHERE id = 'legacy_event'`
      )
      .all();

    expect(rows).toEqual([
      { table_name: "platforms", workspace_id: null },
      { table_name: "profiles", workspace_id: null },
      { table_name: "posts", workspace_id: null },
      { table_name: "schedules", workspace_id: null },
      { table_name: "pipeline_runs", workspace_id: null },
      { table_name: "reply_candidates", workspace_id: null },
      { table_name: "reply_events", workspace_id: null },
    ]);

    sqlite.close();
  });
});
