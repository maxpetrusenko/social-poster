import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const cookieMocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn((name: string, value: string) => {
    cookieMocks.values.set(name, value);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) => {
      const value = cookieMocks.values.get(name);
      return value ? { name, value } : undefined;
    }),
    set: cookieMocks.set,
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
  cookieMocks.values.clear();
  cookieMocks.set.mockClear();
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

  it("selects the invited organization together with its workspace after acceptance", async () => {
    mockSessionEmail = "invitee@example.com";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { acceptInvitationByToken, getTenantContext } = await import(
      "@/lib/tenancy"
    );
    const personalContext = await getTenantContext();
    const now = Math.floor(Date.now() / 1000);
    const invitedOrganizationId = "invited_org";
    const invitedWorkspaceId = "invited_workspace";

    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        invitedOrganizationId,
        "Invited Organization",
        "invited-organization",
        "UTC",
        now,
        now
      );
    sqlite
      .prepare(
        `INSERT INTO workspaces (id, organization_id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        invitedWorkspaceId,
        invitedOrganizationId,
        "Invited Workspace",
        "invited-workspace",
        now,
        now
      );
    sqlite
      .prepare(
        `INSERT INTO workspace_invitations (
           id, organization_id, email, org_role, workspace_assignments,
           token, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "invite_1",
        invitedOrganizationId,
        mockSessionEmail,
        "member",
        JSON.stringify([{ workspaceId: invitedWorkspaceId, role: "editor" }]),
        "invite-token",
        now + 60,
        now
      );

    await acceptInvitationByToken("invite-token");

    expect(personalContext?.organization.id).not.toBe(invitedOrganizationId);
    expect(cookieMocks.values.get("sp_workspace")).toBe(invitedWorkspaceId);

    const invitation = sqlite
      .prepare(
        "SELECT accepted_at FROM workspace_invitations WHERE id = ?"
      )
      .get("invite_1") as { accepted_at: number | null };
    expect(invitation.accepted_at).not.toBeNull();

    sqlite.close();
    vi.resetModules();

    const { sqlite: reopenedSqlite } = await import("@/db");
    const { getTenantContext: getFreshTenantContext } = await import(
      "@/lib/tenancy"
    );
    const acceptedContext = await getFreshTenantContext();

    expect(acceptedContext?.organization.id).toBe(invitedOrganizationId);
    expect(acceptedContext?.orgMembership.organizationId).toBe(
      invitedOrganizationId
    );
    expect(acceptedContext?.currentWorkspace.id).toBe(invitedWorkspaceId);
    expect(acceptedContext?.currentWorkspace.organizationId).toBe(
      acceptedContext?.organization.id
    );

    reopenedSqlite.close();
  });

  it("rejects a forged workspace assignment from another organization before membership writes", async () => {
    mockSessionEmail = "invitee@example.com";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { acceptInvitationByToken, getTenantContext } = await import(
      "@/lib/tenancy"
    );
    const context = await getTenantContext();
    const now = Math.floor(Date.now() / 1000);

    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "invited_org",
        "Invited Org",
        "invited-org",
        "America/New_York",
        now,
        now,
        "foreign_org",
        "Foreign Org",
        "foreign-org",
        "America/New_York",
        now,
        now
      );
    sqlite
      .prepare(
        `INSERT INTO workspaces (id, organization_id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "foreign_workspace",
        "foreign_org",
        "Foreign Workspace",
        "foreign-workspace",
        now,
        now
      );
    sqlite
      .prepare(
        `INSERT INTO workspace_invitations (
           id, organization_id, email, org_role, workspace_assignments,
           token, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "forged_invite",
        "invited_org",
        mockSessionEmail,
        "member",
        JSON.stringify([{ workspaceId: "foreign_workspace", role: "editor" }]),
        "forged-token",
        now + 60,
        now
      );

    await expect(acceptInvitationByToken("forged-token")).rejects.toThrow(
      "Invitation includes a workspace outside its organization."
    );

    expect(
      sqlite
        .prepare(
          "SELECT id FROM org_memberships WHERE user_id = ? AND organization_id = ?"
        )
        .get(context!.user.id, "invited_org")
    ).toBeUndefined();
    expect(
      sqlite
        .prepare(
          "SELECT id FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?"
        )
        .get(context!.user.id, "foreign_workspace")
    ).toBeUndefined();
    expect(
      sqlite
        .prepare("SELECT accepted_at FROM workspace_invitations WHERE id = ?")
        .get("forged_invite")
    ).toEqual({ accepted_at: null });
    expect(
      sqlite
        .prepare(
          "SELECT id FROM audit_events WHERE action = 'invitation.accept' AND target_id = ?"
        )
        .get("forged_invite")
    ).toBeUndefined();

    sqlite.close();
  });

  it("atomically accepts an invitation once across concurrent requests", async () => {
    mockSessionEmail = "invitee@example.com";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { acceptInvitationByToken, getTenantContext } = await import(
      "@/lib/tenancy"
    );
    const context = await getTenantContext();
    const now = Math.floor(Date.now() / 1000);

    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "parallel_org",
        "Parallel Org",
        "parallel-org",
        "America/New_York",
        now,
        now
      );
    sqlite
      .prepare(
        `INSERT INTO workspaces (id, organization_id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "parallel_workspace",
        "parallel_org",
        "Parallel Workspace",
        "parallel-workspace",
        now,
        now
      );
    sqlite
      .prepare(
        `INSERT INTO workspace_invitations (
           id, organization_id, email, org_role, workspace_assignments,
           token, expires_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "parallel_invite",
        "parallel_org",
        mockSessionEmail,
        "member",
        JSON.stringify([{ workspaceId: "parallel_workspace", role: "editor" }]),
        "parallel-token",
        now + 60,
        now
      );

    const results = await Promise.allSettled([
      acceptInvitationByToken("parallel-token"),
      acceptInvitationByToken("parallel-token"),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(
      new Error("Invitation is invalid or expired.")
    );
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM org_memberships WHERE user_id = ? AND organization_id = ?"
        )
        .get(context!.user.id, "parallel_org")
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?"
        )
        .get(context!.user.id, "parallel_workspace")
    ).toEqual({ count: 1 });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'invitation.accept' AND target_id = ?"
        )
        .get("parallel_invite")
    ).toEqual({ count: 1 });

    sqlite.close();
  });

  it.each([
    [
      "different@example.com",
      Math.floor(Date.now() / 1000) + 60,
      null,
      /different email/,
    ],
    [
      "invitee@example.com",
      Math.floor(Date.now() / 1000) - 60,
      null,
      /invalid or expired/,
    ],
    [
      "invitee@example.com",
      Math.floor(Date.now() / 1000) + 60,
      Math.floor(Date.now() / 1000),
      /invalid or expired/,
    ],
  ])(
    "rejects unusable invitations for %s",
    async (invitationEmail, expiresAt, acceptedAt, expectedError) => {
      mockSessionEmail = "invitee@example.com";
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
      vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
      vi.resetModules();

      const { sqlite } = await import("@/db");
      const { acceptInvitationByToken, getTenantContext } = await import(
        "@/lib/tenancy"
      );
      const context = await getTenantContext();
      const now = Math.floor(Date.now() / 1000);

      sqlite
        .prepare(
          `INSERT INTO workspace_invitations (
             id, organization_id, email, org_role, workspace_assignments,
             token, expires_at, accepted_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "invite_bad",
          context!.organization.id,
          invitationEmail,
          "member",
          JSON.stringify([
            { workspaceId: context!.currentWorkspace.id, role: "editor" },
          ]),
          "bad-token",
          expiresAt,
          acceptedAt,
          now
        );

      await expect(acceptInvitationByToken("bad-token")).rejects.toThrow(
        expectedError
      );

      sqlite.close();
    }
  );

  it("creates, rotates, and revokes an invitation as an organization owner", async () => {
    mockSessionEmail = "owner@example.com";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const {
      createInvitation,
      getTenantContext,
      resendInvitation,
      revokeInvitation,
    } = await import("@/lib/tenancy");
    const context = await getTenantContext();
    const created = await createInvitation({
      email: "member@example.com",
      orgRole: "member",
      workspaceAssignments: [
        { workspaceId: context!.currentWorkspace.id, role: "editor" },
      ],
    });

    const resent = await resendInvitation(created.id);
    expect(resent.token).not.toBe(created.token);

    await revokeInvitation(created.id);
    expect(
      sqlite
        .prepare("SELECT id FROM workspace_invitations WHERE id = ?")
        .get(created.id)
    ).toBeUndefined();

    sqlite.close();
  });

  it("requires organization admin access to manage invitations", async () => {
    mockSessionEmail = "member@example.com";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-tenancy-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { getTenantContext } = await import("@/lib/tenancy");
    const context = await getTenantContext();
    sqlite
      .prepare("UPDATE org_memberships SET org_role = 'member' WHERE id = ?")
      .run(context!.orgMembership.id);
    sqlite.close();
    vi.resetModules();

    const { sqlite: reopenedSqlite } = await import("@/db");
    const { createInvitation, resendInvitation, revokeInvitation } = await import(
      "@/lib/tenancy"
    );
    const input = {
      email: "other@example.com",
      orgRole: "member" as const,
      workspaceAssignments: [
        { workspaceId: context!.currentWorkspace.id, role: "editor" as const },
      ],
    };

    await expect(createInvitation(input)).rejects.toThrow(
      "Organization admin access is required."
    );
    await expect(resendInvitation("missing")).rejects.toThrow(
      "Organization admin access is required."
    );
    await expect(revokeInvitation("missing")).rejects.toThrow(
      "Organization admin access is required."
    );

    reopenedSqlite.close();
  });
});
