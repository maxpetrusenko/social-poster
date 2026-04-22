import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/db/schema";

export const sqlite = new Database(":memory:");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(`
  CREATE TABLE organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_label TEXT NOT NULL DEFAULT 'Free',
    max_profiles INTEGER NOT NULL DEFAULT 5,
    max_platforms INTEGER NOT NULL DEFAULT 3,
    max_posts_per_month INTEGER NOT NULL DEFAULT 50,
    billing_email TEXT,
    billing_cycle_start INTEGER,
    deletion_requested_at INTEGER,
    deletion_scheduled_for INTEGER,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE workspaces (
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

  CREATE TABLE posts (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
    profile_id TEXT,
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

  CREATE TABLE approval_requests (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    post_variant_id TEXT,
    status TEXT NOT NULL DEFAULT 'requested',
    requested_by_user_id TEXT,
    requested_for_role TEXT,
    requested_for_email TEXT,
    due_at INTEGER,
    opened_at INTEGER,
    resolved_at INTEGER,
    current_revision_id TEXT,
    policy_snapshot TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export const testDb = drizzle(sqlite, { schema });
