import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { createSourceEvidenceStore } from "@/lib/sources/evidence-store.repository";
import { createManualEvidenceCandidate } from "@/lib/sources/manual";

const sqliteHandles: Database.Database[] = [];

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqliteHandles.push(sqlite);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT '',
      icon_url TEXT,
      primary_color TEXT NOT NULL DEFAULT '',
      secondary_color TEXT NOT NULL DEFAULT '',
      default_hashtags TEXT,
      default_first_comment TEXT NOT NULL DEFAULT '',
      approval_workflow_mode TEXT NOT NULL DEFAULT 'none',
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE source_feeds (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE source_evidence (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_feed_id TEXT REFERENCES source_feeds(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      url TEXT,
      external_id TEXT,
      event_at INTEGER,
      dedupe_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX source_feeds_workspace_name_unique
      ON source_feeds(workspace_id, type, name);
    CREATE UNIQUE INDEX source_evidence_workspace_dedupe_idx
      ON source_evidence(workspace_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL AND dedupe_key != '';
    CREATE UNIQUE INDEX source_evidence_external_idx
      ON source_evidence(workspace_id, source_feed_id, external_id)
      WHERE external_id IS NOT NULL AND external_id != '';
  `);

  return drizzle(sqlite, { schema });
}

afterEach(() => {
  for (const sqlite of sqliteHandles.splice(0)) {
    sqlite.close();
  }
});

async function seedWorkspace(
  db: ReturnType<typeof createTestDb>,
  workspaceId: string,
  feedId: string
) {
  const now = new Date("2026-04-21T12:00:00.000Z");
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    organizationId: "org-1",
    name: `Workspace ${workspaceId}`,
    slug: workspaceId,
    description: "",
    timezone: "UTC",
    iconUrl: null,
    primaryColor: "",
    secondaryColor: "",
    defaultHashtags: [],
    defaultFirstComment: "",
    approvalWorkflowMode: "none",
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.sourceFeeds).values({
    id: feedId,
    workspaceId,
    type: "rss",
    name: `Feed ${feedId}`,
    config: null,
    enabled: true,
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe("source evidence store", () => {
  it("upserts by dedupe key and preserves workspace-scoped status changes", async () => {
    const db = createTestDb();
    const store = createSourceEvidenceStore(db);
    await seedWorkspace(db, "workspace-a", "feed-a");

    const candidate = createManualEvidenceCandidate({
      title: "Note from call",
      summary: "A source-backed note to store.",
      url: "https://example.com/note",
    });

    const first = await store.upsertEvidence({
      workspaceId: "workspace-a",
      sourceFeedId: "feed-a",
      candidate,
    });

    const marked = await store.markEvidenceStatus({
      workspaceId: "workspace-a",
      evidenceId: first.id,
      status: "rejected",
      now: new Date("2026-04-21T13:00:00.000Z"),
    });

    const second = await store.upsertEvidence({
      workspaceId: "workspace-a",
      sourceFeedId: "feed-a",
      candidate,
    });

    const rows = await db.select().from(schema.sourceEvidence);

    expect(rows).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(marked.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    expect(second.sourceFeedId).toBe("feed-a");
  });

  it("keeps evidence separate across workspaces even with the same dedupe key", async () => {
    const db = createTestDb();
    const store = createSourceEvidenceStore(db);
    await seedWorkspace(db, "workspace-a", "feed-a");
    await seedWorkspace(db, "workspace-b", "feed-b");

    const candidate = createManualEvidenceCandidate({
      title: "Shared note",
      summary: "Same dedupe key across workspaces.",
      url: "https://example.com/shared",
    });

    await store.upsertEvidence({
      workspaceId: "workspace-a",
      sourceFeedId: "feed-a",
      candidate,
    });
    await store.upsertEvidence({
      workspaceId: "workspace-b",
      sourceFeedId: "feed-b",
      candidate,
    });

    const aRows = await store.listEvidence({ workspaceId: "workspace-a" });
    const bRows = await store.listEvidence({ workspaceId: "workspace-b" });

    expect(aRows).toHaveLength(1);
    expect(bRows).toHaveLength(1);
    expect(aRows[0]?.workspaceId).toBe("workspace-a");
    expect(bRows[0]?.workspaceId).toBe("workspace-b");
  });

  it("dedupes evidence by external id within a source feed", async () => {
    const db = createTestDb();
    const store = createSourceEvidenceStore(db);
    await seedWorkspace(db, "workspace-a", "feed-a");

    const first = await store.upsertEvidence({
      workspaceId: "workspace-a",
      sourceFeedId: "feed-a",
      candidate: {
        type: "url",
        title: "First title",
        summary: "First summary",
        url: "https://example.com/article",
        externalId: "story-42",
        dedupeKey: "custom:first",
        metadata: { source: "rss" },
      },
    });

    const second = await store.upsertEvidence({
      workspaceId: "workspace-a",
      sourceFeedId: "feed-a",
      candidate: {
        type: "url",
        title: "Updated title",
        summary: "Updated summary",
        url: "https://example.com/article",
        externalId: "story-42",
        dedupeKey: "custom:second",
        metadata: { source: "rss", updated: true },
      },
    });

    const rows = await store.listEvidence({
      workspaceId: "workspace-a",
      sourceFeedId: "feed-a",
    });

    expect(rows).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(rows[0]?.title).toBe("Updated title");
    expect(rows[0]?.metadata).toMatchObject({ source: "rss", updated: true });
  });
});
