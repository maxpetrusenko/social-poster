import "server-only";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

function columnExists(sqlite: Database.Database, table: string, column: string) {
  const columns = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;

  return columns.some((entry) => entry.name === column);
}

function addColumnIfMissing(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string
) {
  if (!columnExists(sqlite, table, column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT,
      avatar_url TEXT,
      auth_provider TEXT NOT NULL DEFAULT 'magic_link',
      provider_user_id TEXT,
      last_workspace_id TEXT,
      last_seen_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      logo_url TEXT,
      default_timezone TEXT NOT NULL DEFAULT 'UTC',
      deletion_requested_at INTEGER,
      deletion_scheduled_for INTEGER,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS org_memberships (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      org_role TEXT NOT NULL DEFAULT 'member',
      invited_at INTEGER NOT NULL,
      accepted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS workspace_memberships (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      workspace_role TEXT NOT NULL DEFAULT 'viewer',
      added_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_invitations (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      org_role TEXT NOT NULL DEFAULT 'member',
      workspace_assignments TEXT,
      invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      accepted_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      handle TEXT,
      account_id TEXT,
      provider TEXT NOT NULL DEFAULT 'zernio',
      config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT,
      voice_id TEXT,
      face_id TEXT,
      tone TEXT,
      config TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      profile_id TEXT REFERENCES profiles(id),
      title TEXT,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      media_url TEXT,
      source_url TEXT,
      source_title TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at INTEGER,
      published_at INTEGER,
      dedup_key TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_targets (
      id TEXT PRIMARY KEY NOT NULL,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      platform_id TEXT NOT NULL REFERENCES platforms(id),
      status TEXT NOT NULL DEFAULT 'pending',
      published_url TEXT,
      platform_post_id TEXT,
      error TEXT,
      published_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      cron TEXT NOT NULL,
      cron_human TEXT,
      job_type TEXT NOT NULL,
      profile_id TEXT REFERENCES profiles(id),
      target_platform_ids TEXT,
      config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      schedule_id TEXT REFERENCES schedules(id),
      post_id TEXT REFERENCES posts(id),
      trigger TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      steps TEXT,
      error TEXT,
      duration_ms INTEGER,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS reply_events (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      run_id TEXT REFERENCES pipeline_runs(id) ON DELETE SET NULL,
      schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
      platform_id TEXT REFERENCES platforms(id) ON DELETE SET NULL,
      tweet_url TEXT NOT NULL,
      reply_url TEXT,
      author_handle TEXT NOT NULL,
      category TEXT,
      lane TEXT NOT NULL,
      reply_text TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      error TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reply_candidates (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      platform_id TEXT REFERENCES platforms(id) ON DELETE SET NULL,
      tweet_id TEXT NOT NULL,
      tweet_url TEXT NOT NULL UNIQUE,
      reply_url TEXT,
      author_handle TEXT NOT NULL,
      author_name TEXT,
      tweet_text TEXT NOT NULL,
      hook TEXT,
      status TEXT NOT NULL DEFAULT 'drafted',
      risk_level TEXT NOT NULL DEFAULT 'low',
      score INTEGER NOT NULL DEFAULT 0,
      replies_scraped INTEGER NOT NULL DEFAULT 0,
      tags TEXT,
      popular_replies TEXT,
      drafts TEXT,
      selected_draft_index INTEGER NOT NULL DEFAULT 0,
      posted_at_label TEXT,
      metadata TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dedup_cache (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL UNIQUE,
      source TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS candidate_cache (
      link TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      score INTEGER NOT NULL,
      image_url TEXT,
      og_image_url TEXT,
      source_name TEXT,
      published_at INTEGER,
      fetched_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
    CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_idx ON organizations(slug);
    CREATE UNIQUE INDEX IF NOT EXISTS workspaces_org_slug_idx ON workspaces(organization_id, slug);
    CREATE UNIQUE INDEX IF NOT EXISTS org_memberships_user_org_idx ON org_memberships(user_id, organization_id);
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_user_workspace_idx ON workspace_memberships(user_id, workspace_id);
  `);

  addColumnIfMissing(sqlite, "platforms", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "profiles", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "posts", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "schedules", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "pipeline_runs", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "reply_events", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "reply_candidates", "workspace_id", "workspace_id TEXT");
}

const dbPath = process.env.DATABASE_URL ?? "./data/social-poster.db";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
try {
  sqlite.pragma("journal_mode = WAL");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("database is locked")) {
    throw error;
  }
}
ensureSchema(sqlite);

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
