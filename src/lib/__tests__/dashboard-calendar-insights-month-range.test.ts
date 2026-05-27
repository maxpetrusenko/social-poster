import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let tempDir: string | null = null;
const originalTimeZone = process.env.TZ;

function dbTime(value: string) {
  return Math.floor(Date.parse(value) / 1000);
}

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function setupCalendarDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-calendar-"));
  vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
  vi.stubEnv("TZ", "America/New_York");
  vi.resetModules();

  const { sqlite } = await import("@/db");
  await import("@/lib/timezone");

  process.env.TZ = "UTC";

  const now = Date.UTC(2026, 4, 15);
  sqlite
    .prepare(
      `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run("org_1", "SMM Agent", "smm-agent", "America/New_York", now, now);
  sqlite
    .prepare(
      `INSERT INTO workspaces (id, organization_id, name, slug, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run("workspace_1", "org_1", "Primary Workspace", "primary-workspace", "America/New_York", now, now);
  sqlite
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, content, content_type, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "late_may_post",
      "workspace_1",
      "Late May",
      "Still May in New York",
      "text",
      "published",
      dbTime("2026-06-01T03:30:00.000Z"),
      now,
      now
    );
  sqlite
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, content, content_type, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "late_april_post",
      "workspace_1",
      "Late April",
      "Still April in New York",
      "text",
      "published",
      dbTime("2026-05-01T01:30:00.000Z"),
      now,
      now
    );
  sqlite
    .prepare(
      `INSERT INTO pipeline_runs (id, workspace_id, trigger, status, steps, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      "late_may_run",
      "workspace_1",
      "manual",
      "completed",
      "[]",
      dbTime("2026-06-01T03:30:00.000Z")
    );
  sqlite
    .prepare(
      `INSERT INTO pipeline_runs (id, workspace_id, trigger, status, steps, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      "late_april_run",
      "workspace_1",
      "manual",
      "completed",
      "[]",
      dbTime("2026-05-01T01:30:00.000Z")
    );

  return sqlite;
}

describe("calendar month ranges", () => {
  it("keeps dedicated calendar events in the app-timezone month on UTC servers", async () => {
    const sqlite = await setupCalendarDb();
    const { getCalendarInsights } = await import("@/lib/dashboard/calendar");

    const calendar = await getCalendarInsights("2026-05", "workspace_1");
    const eventIds = Object.values(calendar.eventsByDay)
      .flat()
      .map((event) => event.id);

    expect(Object.keys(calendar.eventsByDay)).toContain("2026-05-31");
    expect(calendar.eventsByDay["2026-05-31"]?.map((event) => event.id) ?? []).toContain(
      "late_may_post-published"
    );
    expect(eventIds).toContain("late_may_run");
    expect(eventIds).not.toContain("late_april_post-published");
    expect(eventIds).not.toContain("late_april_run");

    sqlite.close();
  });

  it("keeps publish calendar runs in the app-timezone month on UTC servers", async () => {
    const sqlite = await setupCalendarDb();
    const { getCalendarInsights } = await import("@/lib/dashboard/insights");

    const calendar = await getCalendarInsights("2026-05", "workspace_1");
    const eventIds = Object.values(calendar.eventsByDay)
      .flat()
      .map((event) => event.id);

    expect(calendar.eventsByDay["2026-05-31"]?.map((event) => event.id) ?? []).toContain(
      "late_may_run"
    );
    expect(eventIds).not.toContain("late_april_run");

    sqlite.close();
  });
});
