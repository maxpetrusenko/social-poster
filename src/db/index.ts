import "server-only";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";
import { collapseDuplicatePlatformConnections } from "./platform-dedupe";

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
  const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return;
  if (!columnExists(sqlite, table, column)) {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    } catch (error) {
      // Next.js build workers may initialize the same SQLite database in
      // parallel. Another worker can add the column after our existence check.
      if (!(error instanceof Error) || !error.message.includes(`duplicate column name: ${column}`)) {
        throw error;
      }
    }
  }
}

function hasForeignKey(sqlite: Database.Database, table: string, from: string, target: string) {
  return (sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{ from: string; table: string }>)
    .some((entry) => entry.from === from && entry.table === target);
}

function rebuildLegacyWorkToPostControls(sqlite: Database.Database) {
  const needsReceipts = !hasForeignKey(sqlite, "command_receipts", "candidate_id", "content_candidates");
  const needsDispatches = !hasForeignKey(sqlite, "dispatch_intents", "candidate_id", "content_candidates");
  const needsDecisions = !hasForeignKey(sqlite, "content_decisions", "candidate_id", "content_candidates");
  if (!needsReceipts && !needsDispatches && !needsDecisions) return;

  sqlite.transaction(() => {
    const workspaces = sqlite.prepare(`
      SELECT workspace_id FROM command_receipts
      UNION SELECT workspace_id FROM dispatch_intents
      UNION SELECT workspace_id FROM content_decisions
    `).all() as Array<{ workspace_id: string }>;
    const insertCompletion = sqlite.prepare(`
      INSERT OR IGNORE INTO work_completion_events
        (id, workspace_id, source_agent, external_event_id, session_ref, project_ref, summary, privacy, status, occurred_at, created_at)
      VALUES (?, ?, 'legacy', ?, 'legacy-migration', 'social-poster', 'Legacy control-row migration', 'public_safe', 'needs_proof', 0, 0)
    `);
    const insertCandidate = sqlite.prepare(`
      INSERT OR IGNORE INTO content_candidates
        (id, workspace_id, completion_event_id, status, current_revision, created_at, updated_at)
      VALUES (?, ?, ?, 'needs_proof', 0, 0, 0)
    `);
    for (const { workspace_id: workspaceId } of workspaces) {
      const suffix = Buffer.from(workspaceId).toString("hex").toUpperCase();
      const completionId = `legacy-completion:${suffix}`;
      const candidateId = `legacy-candidate:${suffix}`;
      insertCompletion.run(completionId, workspaceId, `legacy-control:${suffix}`);
      insertCandidate.run(candidateId, workspaceId, completionId);
    }

    sqlite.exec(`
      DROP INDEX IF EXISTS command_receipts_replay_unique;
      DROP INDEX IF EXISTS command_receipts_candidate_idx;
      DROP INDEX IF EXISTS dispatch_intents_approval_unique;
      DROP INDEX IF EXISTS content_decisions_replay_unique;
      DROP INDEX IF EXISTS content_decisions_approval_unique;
    `);

    if (needsReceipts) sqlite.exec(`
      ALTER TABLE command_receipts RENAME TO command_receipts_legacy;
      CREATE TABLE command_receipts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE,
        revision_number INTEGER NOT NULL,
        command_type TEXT NOT NULL,
        scope_digest TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        state TEXT NOT NULL,
        lease_expires_at INTEGER,
        attempts INTEGER NOT NULL,
        response TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO command_receipts
      SELECT id, workspace_id, COALESCE(NULLIF(operation, ''), 'decision'), idempotency_key,
        CASE WHEN candidate_id IS NOT NULL AND candidate_id != ''
          AND EXISTS (SELECT 1 FROM content_candidates c WHERE c.id = command_receipts_legacy.candidate_id)
          THEN candidate_id ELSE 'legacy-candidate:' || hex(workspace_id) END,
        COALESCE(revision_number, 0), COALESCE(NULLIF(command_type, ''), 'unknown'),
        COALESCE(scope_digest, ''), request_hash,
        CASE WHEN response IS NOT NULL AND response != '' THEN 'completed' ELSE 'failed' END,
        NULL, MAX(COALESCE(attempts, 1), 1), NULLIF(response, ''), created_at,
        CASE WHEN updated_at IS NULL OR updated_at = 0 THEN created_at ELSE updated_at END
      FROM command_receipts_legacy;
      DROP TABLE command_receipts_legacy;
    `);

    if (needsDispatches) sqlite.exec(`
      ALTER TABLE dispatch_intents RENAME TO dispatch_intents_legacy;
      CREATE TABLE dispatch_intents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        approval_digest TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO dispatch_intents
      SELECT id, workspace_id,
        CASE WHEN candidate_id IS NOT NULL AND candidate_id != ''
          AND EXISTS (SELECT 1 FROM content_candidates c WHERE c.id = dispatch_intents_legacy.candidate_id)
          THEN candidate_id ELSE 'legacy-candidate:' || hex(workspace_id) END,
        action, status, request_hash,
        CASE
          WHEN approval_digest IS NULL OR approval_digest = '' THEN 'legacy:' || id
          WHEN (SELECT COUNT(*) FROM dispatch_intents_legacy d
                WHERE d.workspace_id = dispatch_intents_legacy.workspace_id
                  AND d.approval_digest = dispatch_intents_legacy.approval_digest) > 1
            THEN approval_digest || ':legacy:' || id
          ELSE approval_digest
        END,
        created_at
      FROM dispatch_intents_legacy;
      DROP TABLE dispatch_intents_legacy;
    `);

    if (needsDecisions) sqlite.exec(`
      ALTER TABLE content_decisions RENAME TO content_decisions_legacy;
      CREATE TABLE content_decisions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE,
        command_type TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        approval_digest TEXT,
        dispatch_id TEXT,
        created_at INTEGER NOT NULL
      );
      INSERT INTO content_decisions
      SELECT id, workspace_id,
        CASE WHEN candidate_id IS NOT NULL AND candidate_id != ''
          AND EXISTS (SELECT 1 FROM content_candidates c WHERE c.id = content_decisions_legacy.candidate_id)
          THEN candidate_id ELSE 'legacy-candidate:' || hex(workspace_id) END,
        command_type, request_hash,
        CASE WHEN approval_digest IS NOT NULL AND approval_digest != ''
          AND id = (SELECT MIN(d.id) FROM content_decisions_legacy d
                    WHERE d.workspace_id = content_decisions_legacy.workspace_id
                      AND d.approval_digest = content_decisions_legacy.approval_digest)
          THEN approval_digest ELSE NULL END,
        dispatch_id, created_at
      FROM content_decisions_legacy;
      DROP TABLE content_decisions_legacy;
    `);

    sqlite.exec(`
      CREATE UNIQUE INDEX command_receipts_replay_unique ON command_receipts(workspace_id, operation, idempotency_key);
      CREATE INDEX command_receipts_candidate_idx ON command_receipts(workspace_id, candidate_id, revision_number);
      CREATE UNIQUE INDEX dispatch_intents_approval_unique ON dispatch_intents(workspace_id, approval_digest);
      CREATE UNIQUE INDEX content_decisions_replay_unique ON content_decisions(workspace_id, request_hash);
      CREATE UNIQUE INDEX content_decisions_approval_unique ON content_decisions(workspace_id, approval_digest) WHERE approval_digest IS NOT NULL;
    `);
  })();

  const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
  if (violations.length) throw new Error(`Work-to-post migration left ${violations.length} foreign-key violation(s).`);
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

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata TEXT,
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

    CREATE TABLE IF NOT EXISTS waitlist_signups (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'landing',
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_unique
    ON waitlist_signups(email);

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

    CREATE TABLE IF NOT EXISTS platform_capabilities (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
      capability TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      confidence TEXT NOT NULL DEFAULT 'provider_default',
      source TEXT NOT NULL DEFAULT 'provider_default',
      evidence TEXT,
      last_checked_at INTEGER,
      last_observed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS platform_capabilities_platform_capability_unique
      ON platform_capabilities(platform_id, capability);
    CREATE INDEX IF NOT EXISTS platform_capabilities_workspace_idx
      ON platform_capabilities(workspace_id);

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

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      brief TEXT NOT NULL DEFAULT '',
      objective TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      selected_platforms TEXT,
      selected_creative_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_generation_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      input_snapshot TEXT,
      model_config TEXT,
      result_summary TEXT,
      error TEXT,
      ledger_path TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS campaign_creatives (
      id TEXT PRIMARY KEY NOT NULL,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      generation_session_id TEXT REFERENCES campaign_generation_sessions(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      source_prompt TEXT NOT NULL DEFAULT '',
      visual_spec TEXT,
      image_model TEXT NOT NULL DEFAULT 'mock',
      source_image_url TEXT,
      source_image_width INTEGER NOT NULL DEFAULT 2048,
      source_image_height INTEGER NOT NULL DEFAULT 2048,
      source_focal_point TEXT,
      source_safe_zone TEXT,
      score TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_layers (
      id TEXT PRIMARY KEY NOT NULL,
      creative_id TEXT NOT NULL REFERENCES campaign_creatives(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      media_url TEXT,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      rotation INTEGER NOT NULL DEFAULT 0,
      font_family TEXT NOT NULL DEFAULT '',
      font_size INTEGER NOT NULL DEFAULT 0,
      line_height INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '',
      background_color TEXT,
      visible INTEGER NOT NULL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      z_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS campaign_renditions (
      id TEXT PRIMARY KEY NOT NULL,
      creative_id TEXT NOT NULL REFERENCES campaign_creatives(id) ON DELETE CASCADE,
      platform_type TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'default',
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      aspect_ratio TEXT NOT NULL,
      crop TEXT,
      layer_overrides TEXT,
      exported_media_url TEXT,
      validation TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      post_id TEXT,
      post_target_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_events (
      id TEXT PRIMARY KEY NOT NULL,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      creative_id TEXT REFERENCES campaign_creatives(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
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

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      post_variant_id TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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

    CREATE INDEX IF NOT EXISTS approval_requests_workspace_post_idx
      ON approval_requests(workspace_id, post_id);
    CREATE INDEX IF NOT EXISTS approval_requests_workspace_status_idx
      ON approval_requests(workspace_id, status);

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

    CREATE TABLE IF NOT EXISTS source_feeds (
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

    CREATE TABLE IF NOT EXISTS source_evidence (
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

    CREATE TABLE IF NOT EXISTS inbox_conversations (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      platform_id TEXT REFERENCES platforms(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      surface TEXT NOT NULL,
      external_thread_id TEXT NOT NULL,
      external_url TEXT,
      subject TEXT,
      status TEXT NOT NULL DEFAULT 'needs_reply',
      priority TEXT NOT NULL DEFAULT 'normal',
      assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      last_message_at INTEGER,
      first_message_at INTEGER,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inbox_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      platform_id TEXT REFERENCES platforms(id) ON DELETE SET NULL,
      surface TEXT NOT NULL,
      provider_message_id TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'incoming',
      author_handle TEXT NOT NULL DEFAULT '',
      author_name TEXT,
      body TEXT NOT NULL,
      source_url TEXT,
      sent_at INTEGER,
      read_at INTEGER,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inbox_seen_watermarks (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      surface TEXT NOT NULL,
      platform_key TEXT NOT NULL DEFAULT 'all',
      seen_at INTEGER NOT NULL,
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

    CREATE TABLE IF NOT EXISTS rss_sources (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 10,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rss_settings (
      workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      candidate_window_hours INTEGER NOT NULL DEFAULT 48,
      candidate_pool_size INTEGER NOT NULL DEFAULT 24,
      minimum_score INTEGER NOT NULL DEFAULT 0,
      traction_weight INTEGER NOT NULL DEFAULT 35,
      keyword_boost_terms TEXT,
      x_template TEXT NOT NULL,
      linkedin_template TEXT NOT NULL,
      transformation_prompt TEXT NOT NULL DEFAULT '',
      image_selection_mode TEXT NOT NULL DEFAULT 'prefer_feed',
      image_selection_notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
    CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_idx ON organizations(slug);
    CREATE UNIQUE INDEX IF NOT EXISTS workspaces_org_slug_idx ON workspaces(organization_id, slug);
    CREATE UNIQUE INDEX IF NOT EXISTS org_memberships_user_org_idx ON org_memberships(user_id, organization_id);
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_memberships_user_workspace_idx ON workspace_memberships(user_id, workspace_id);
    CREATE INDEX IF NOT EXISTS campaigns_workspace_profile_idx ON campaigns(workspace_id, profile_id);
    CREATE INDEX IF NOT EXISTS campaign_generation_sessions_campaign_idx ON campaign_generation_sessions(campaign_id);
    CREATE INDEX IF NOT EXISTS campaign_creatives_campaign_idx ON campaign_creatives(campaign_id);
    CREATE INDEX IF NOT EXISTS campaign_layers_creative_idx ON campaign_layers(creative_id);
    CREATE INDEX IF NOT EXISTS campaign_renditions_creative_idx ON campaign_renditions(creative_id);
    CREATE INDEX IF NOT EXISTS campaign_events_campaign_idx ON campaign_events(campaign_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS rss_sources_workspace_url_idx ON rss_sources(workspace_id, url);
    CREATE INDEX IF NOT EXISTS audit_events_org_created_idx ON audit_events(organization_id, created_at);
    CREATE INDEX IF NOT EXISTS audit_events_workspace_created_idx ON audit_events(workspace_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS inbox_conversations_external_unique
      ON inbox_conversations(workspace_id, platform_id, surface, external_thread_id)
      WHERE workspace_id IS NOT NULL AND platform_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_provider_unique
      ON inbox_messages(conversation_id, provider_message_id);
    CREATE INDEX IF NOT EXISTS inbox_messages_workspace_surface_idx
      ON inbox_messages(workspace_id, surface, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS inbox_seen_watermarks_workspace_surface_platform_idx
      ON inbox_seen_watermarks(workspace_id, surface, platform_key)
      WHERE workspace_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS source_feeds_workspace_name_unique
      ON source_feeds(workspace_id, type, name);
    CREATE UNIQUE INDEX IF NOT EXISTS source_evidence_workspace_dedupe_idx
      ON source_evidence(workspace_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL AND dedupe_key != '';
    CREATE UNIQUE INDEX IF NOT EXISTS source_evidence_external_idx
      ON source_evidence(workspace_id, source_feed_id, external_id)
      WHERE external_id IS NOT NULL AND external_id != '';
  `);

  addColumnIfMissing(sqlite, "platforms", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "profiles", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "posts", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "schedules", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "pipeline_runs", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "reply_events", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "reply_candidates", "workspace_id", "workspace_id TEXT");
  addColumnIfMissing(sqlite, "inbox_messages", "read_at", "read_at INTEGER");
  addColumnIfMissing(sqlite, "rss_settings", "traction_weight", "traction_weight INTEGER NOT NULL DEFAULT 35");
  addColumnIfMissing(sqlite, "rss_settings", "transformation_prompt", "transformation_prompt TEXT NOT NULL DEFAULT ''");

  // ── Plan fields on organizations ──
  addColumnIfMissing(sqlite, "organizations", "plan", "plan TEXT NOT NULL DEFAULT 'free'");
  addColumnIfMissing(sqlite, "organizations", "plan_label", "plan_label TEXT NOT NULL DEFAULT 'Free'");
  addColumnIfMissing(sqlite, "organizations", "max_profiles", "max_profiles INTEGER NOT NULL DEFAULT 5");
  addColumnIfMissing(sqlite, "organizations", "max_platforms", "max_platforms INTEGER NOT NULL DEFAULT 3");
  addColumnIfMissing(sqlite, "organizations", "max_posts_per_month", "max_posts_per_month INTEGER NOT NULL DEFAULT 50");
  addColumnIfMissing(sqlite, "organizations", "billing_email", "billing_email TEXT");
  addColumnIfMissing(sqlite, "organizations", "billing_cycle_start", "billing_cycle_start INTEGER");

  // ── API Keys ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_suffix TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'all',
      permission TEXT NOT NULL DEFAULT 'read',
      status TEXT NOT NULL DEFAULT 'active',
      last_used_at INTEGER,
      revoked_at INTEGER,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );
  `);

  // ── AI Model Providers ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS model_provider_credentials (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      label TEXT NOT NULL,
      base_url TEXT,
      protocol TEXT NOT NULL DEFAULT 'openai_responses',
      encrypted_api_key TEXT NOT NULL,
      encrypted_management_key TEXT,
      key_prefix TEXT NOT NULL DEFAULT '',
      key_suffix TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'untested',
      status_message TEXT NOT NULL DEFAULT '',
      last_tested_at INTEGER,
      last_synced_at INTEGER,
      metadata TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS model_provider_workspace_idx
      ON model_provider_credentials(workspace_id);

    CREATE TABLE IF NOT EXISTS model_catalog (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      credential_id TEXT REFERENCES model_provider_credentials(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      capabilities TEXT,
      context_window INTEGER,
      input_price TEXT,
      output_price TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      source TEXT NOT NULL DEFAULT 'discovered',
      deprecated_at INTEGER,
      last_seen_at INTEGER,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS model_catalog_workspace_model_unique
      ON model_catalog(workspace_id, provider, model_id);
    CREATE INDEX IF NOT EXISTS model_catalog_workspace_idx
      ON model_catalog(workspace_id);

    CREATE TABLE IF NOT EXISTS workspace_model_defaults (
      workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      writing_model_catalog_id TEXT REFERENCES model_catalog(id) ON DELETE SET NULL,
      reply_model_catalog_id TEXT REFERENCES model_catalog(id) ON DELETE SET NULL,
      agent_model_catalog_id TEXT REFERENCES model_catalog(id) ON DELETE SET NULL,
      fast_model_catalog_id TEXT REFERENCES model_catalog(id) ON DELETE SET NULL,
      image_model_catalog_id TEXT REFERENCES model_catalog(id) ON DELETE SET NULL,
      embedding_model_catalog_id TEXT REFERENCES model_catalog(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // ── Notification Preferences ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      post_failures INTEGER NOT NULL DEFAULT 1,
      account_disconnects INTEGER NOT NULL DEFAULT 1,
      payment_alerts INTEGER NOT NULL DEFAULT 1,
      usage_alerts INTEGER NOT NULL DEFAULT 1,
      marketing_emails INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS notification_prefs_user_workspace_idx
    ON notification_preferences(user_id, workspace_id);
  `);

  // ── User UI Preferences ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user_ui_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      product_mode TEXT NOT NULL DEFAULT 'saas',
      agent_dock_mode TEXT NOT NULL DEFAULT 'right-widget',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_ui_prefs_user_workspace_idx
    ON user_ui_preferences(user_id, workspace_id);
  `);

  // ── Usage Events ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      platform_id TEXT REFERENCES platforms(id),
      event_type TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_events_workspace_type_idx
    ON usage_events(workspace_id, event_type);
    CREATE INDEX IF NOT EXISTS usage_events_created_idx
    ON usage_events(workspace_id, created_at);
  `);

  // ── Activity + Email Delivery ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      entity_type TEXT,
      entity_id TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      metadata TEXT,
      correlation_id TEXT,
      dedupe_key TEXT,
      source TEXT NOT NULL DEFAULT 'app',
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS activity_log_workspace_dedupe_idx
    ON activity_log(workspace_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL AND dedupe_key != '';

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      activity_log_id TEXT REFERENCES activity_log(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL DEFAULT 'in_app',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'info',
      status TEXT NOT NULL DEFAULT 'unread',
      read_at INTEGER,
      dismissed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notifications_recipient_status_idx
    ON notifications(recipient_user_id, status, created_at);

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
      channel TEXT NOT NULL DEFAULT 'email',
      provider TEXT NOT NULL DEFAULT 'resend',
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      external_message_id TEXT,
      idempotency_key TEXT,
      error_classification TEXT,
      error_message TEXT,
      sent_at INTEGER,
      delivered_at INTEGER,
      failed_at INTEGER,
      next_retry_at INTEGER,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_idempotency_idx
    ON notification_deliveries(idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
    CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx
    ON notification_deliveries(status, next_retry_at);

    CREATE TABLE IF NOT EXISTS email_events (
      id TEXT PRIMARY KEY,
      delivery_id TEXT REFERENCES notification_deliveries(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      provider_event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      recipient_email TEXT,
      external_message_id TEXT,
      payload TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS email_events_provider_event_idx
    ON email_events(provider, provider_event_id);
    CREATE INDEX IF NOT EXISTS email_events_message_idx
    ON email_events(external_message_id, event_type);

    CREATE TABLE IF NOT EXISTS email_suppressions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'marketing',
      reason TEXT NOT NULL,
      provider TEXT,
      event_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_email_scope_idx
    ON email_suppressions(email, scope);

    CREATE TABLE IF NOT EXISTS lead_magnet_downloads (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      lead_magnet_key TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'landing',
      marketing_consent INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lead_magnet_downloads_email_idx
    ON lead_magnet_downloads(email, created_at);

    CREATE TABLE IF NOT EXISTS drip_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email_key TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      sent_at INTEGER,
      cancelled_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS drip_queue_user_email_key_idx
    ON drip_queue(user_id, email_key);
    CREATE INDEX IF NOT EXISTS drip_queue_due_idx
    ON drip_queue(scheduled_at, sent_at, cancelled_at);

    CREATE TABLE IF NOT EXISTS blog_automation_posts (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Automation',
      status TEXT NOT NULL DEFAULT 'draft',
      review_status TEXT NOT NULL DEFAULT 'needs_review',
      publish_status TEXT NOT NULL DEFAULT 'idle',
      direct_answer TEXT NOT NULL DEFAULT '',
      thesis TEXT NOT NULL DEFAULT '',
      content_markdown TEXT NOT NULL DEFAULT '',
      hero_image_url TEXT,
      hero_image_alt TEXT,
      sources TEXT,
      framework_checks TEXT,
      validation_status TEXT NOT NULL DEFAULT 'warn',
      validation_score INTEGER NOT NULL DEFAULT 0,
      target_words INTEGER NOT NULL DEFAULT 2000,
      scheduled_for INTEGER,
      generated_at INTEGER,
      reviewed_at INTEGER,
      published_at INTEGER,
      medium_article_id TEXT,
      medium_url TEXT,
      external_draft_path TEXT,
      last_error TEXT,
      created_by_email TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS blog_automation_posts_status_idx
    ON blog_automation_posts(status, publish_status, created_at);
    CREATE INDEX IF NOT EXISTS blog_automation_posts_published_idx
    ON blog_automation_posts(publish_status, published_at);

    CREATE TABLE IF NOT EXISTS blog_automation_runs (
      id TEXT PRIMARY KEY,
      post_id TEXT REFERENCES blog_automation_posts(id) ON DELETE SET NULL,
      trigger TEXT NOT NULL,
      phase TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      input TEXT,
      output TEXT,
      error TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS blog_automation_runs_post_idx
    ON blog_automation_runs(post_id, started_at);
  `);

  // Additive upgrades for databases created by the first work-to-post slice.
  // SQLite cannot add foreign-key constraints in place; fresh databases carry
  // them in the DDL below, while existing rows retain their original tables.
  addColumnIfMissing(sqlite, "content_revisions", "assigned_account", "assigned_account TEXT");
  addColumnIfMissing(sqlite, "content_revisions", "policy_version", "policy_version TEXT");
  addColumnIfMissing(sqlite, "content_revisions", "approval_expires_at", "approval_expires_at INTEGER");
  addColumnIfMissing(sqlite, "command_receipts", "operation", "operation TEXT NOT NULL DEFAULT 'decision'");
  addColumnIfMissing(sqlite, "command_receipts", "candidate_id", "candidate_id TEXT");
  addColumnIfMissing(sqlite, "command_receipts", "revision_number", "revision_number INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "command_receipts", "command_type", "command_type TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing(sqlite, "command_receipts", "scope_digest", "scope_digest TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, "command_receipts", "state", "state TEXT NOT NULL DEFAULT 'failed'");
  addColumnIfMissing(sqlite, "command_receipts", "lease_expires_at", "lease_expires_at INTEGER");
  addColumnIfMissing(sqlite, "command_receipts", "attempts", "attempts INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing(sqlite, "command_receipts", "updated_at", "updated_at INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "dispatch_intents", "approval_digest", "approval_digest TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, "content_decisions", "approval_digest", "approval_digest TEXT");
  addColumnIfMissing(sqlite, "content_decisions", "dispatch_id", "dispatch_id TEXT");
  addColumnIfMissing(sqlite, "learning_proposals", "reason_codes", "reason_codes TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(sqlite, "learning_proposals", "scope", "scope TEXT NOT NULL DEFAULT 'candidate'");
  addColumnIfMissing(sqlite, "learning_proposals", "trait_key", "trait_key TEXT");
  addColumnIfMissing(sqlite, "learning_proposals", "direction", "direction TEXT");
  addColumnIfMissing(sqlite, "learning_proposals", "evidence_event_ids", "evidence_event_ids TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(sqlite, "learning_proposals", "confidence", "confidence INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "learning_proposals", "expires_at", "expires_at INTEGER");
  sqlite.exec("DROP INDEX IF EXISTS command_receipts_replay_unique; DROP INDEX IF EXISTS dispatch_intents_request_unique;");
  if (sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dispatch_intents'").get()) {
    sqlite.exec("UPDATE dispatch_intents SET approval_digest = 'legacy:' || id WHERE approval_digest IS NULL OR approval_digest = ''");
  }

  // Isolated work-to-post domain. No foreign keys to posts/replies/schedules by design.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS work_completion_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_agent TEXT NOT NULL, external_event_id TEXT NOT NULL, session_ref TEXT NOT NULL, project_ref TEXT NOT NULL, summary TEXT NOT NULL, privacy TEXT NOT NULL, status TEXT NOT NULL, occurred_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS work_completion_events_replay_unique ON work_completion_events(workspace_id, source_agent, external_event_id);
    CREATE TABLE IF NOT EXISTS work_completion_proofs (id TEXT PRIMARY KEY, completion_event_id TEXT NOT NULL REFERENCES work_completion_events(id) ON DELETE CASCADE, type TEXT NOT NULL, uri TEXT NOT NULL, hash TEXT, verified_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS content_candidates (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, completion_event_id TEXT NOT NULL REFERENCES work_completion_events(id) ON DELETE CASCADE, status TEXT NOT NULL, current_revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS content_candidates_completion_unique ON content_candidates(workspace_id, completion_event_id);
    CREATE TABLE IF NOT EXISTS content_revisions (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE, revision_number INTEGER NOT NULL, content_digest TEXT NOT NULL, media_digest TEXT, account_digest TEXT, policy_digest TEXT, assigned_account TEXT, policy_version TEXT, approval_expires_at INTEGER, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS content_revisions_number_unique ON content_revisions(candidate_id, revision_number);
    CREATE TABLE IF NOT EXISTS content_lifecycle_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, candidate_id TEXT NOT NULL, event_type TEXT NOT NULL, revision_number INTEGER NOT NULL, trace_ref TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS content_lifecycle_events_candidate_idx ON content_lifecycle_events(workspace_id, candidate_id, created_at);
    CREATE TABLE IF NOT EXISTS content_trace_links (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, stage TEXT NOT NULL, trace_ref TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reference_examples (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_url TEXT NOT NULL, author TEXT NOT NULL, captured_at INTEGER NOT NULL, mechanism TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS content_angles (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, revision_number INTEGER NOT NULL, title TEXT NOT NULL, provenance TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS content_comments (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, revision_number INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS content_reviews (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE, revision_number INTEGER NOT NULL, revision_digest TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS content_reviews_revision_digest_unique ON content_reviews(candidate_id, revision_number, revision_digest);
    CREATE TABLE IF NOT EXISTS content_decisions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE, command_type TEXT NOT NULL, request_hash TEXT NOT NULL, approval_digest TEXT, dispatch_id TEXT, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS content_decisions_replay_unique ON content_decisions(workspace_id, request_hash);
    CREATE UNIQUE INDEX IF NOT EXISTS content_decisions_approval_unique ON content_decisions(workspace_id, approval_digest) WHERE approval_digest IS NOT NULL;
    CREATE TABLE IF NOT EXISTS command_receipts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE, revision_number INTEGER NOT NULL, command_type TEXT NOT NULL, scope_digest TEXT NOT NULL, request_hash TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'processing', lease_expires_at INTEGER, attempts INTEGER NOT NULL DEFAULT 1, response TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS command_receipts_replay_unique ON command_receipts(workspace_id, operation, idempotency_key);
    CREATE INDEX IF NOT EXISTS command_receipts_candidate_idx ON command_receipts(workspace_id, candidate_id, revision_number);
    CREATE TABLE IF NOT EXISTS dispatch_intents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE, action TEXT NOT NULL, status TEXT NOT NULL, request_hash TEXT NOT NULL, approval_digest TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS dispatch_intents_approval_unique ON dispatch_intents(workspace_id, approval_digest);
    CREATE TABLE IF NOT EXISTS learning_proposals (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, candidate_id TEXT NOT NULL REFERENCES content_candidates(id) ON DELETE CASCADE, status TEXT NOT NULL, reason_codes TEXT NOT NULL DEFAULT '[]', scope TEXT NOT NULL DEFAULT 'candidate', trait_key TEXT, direction TEXT, evidence_event_ids TEXT NOT NULL DEFAULT '[]', confidence INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS learning_proposals_candidate_idx ON learning_proposals(workspace_id, candidate_id, created_at);
    CREATE TABLE IF NOT EXISTS learning_rule_versions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, proposal_id TEXT NOT NULL REFERENCES learning_proposals(id) ON DELETE CASCADE, version_number INTEGER NOT NULL, status TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'candidate', trait TEXT, direction TEXT, evidence TEXT NOT NULL DEFAULT '[]', confidence INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS content_outcomes (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, captured_at INTEGER NOT NULL, metrics TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS person_dossiers (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, canonical_identity_key TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL, current_version INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS person_dossiers_identity_unique ON person_dossiers(workspace_id, canonical_identity_key);
    CREATE TABLE IF NOT EXISTS person_dossier_versions (id TEXT PRIMARY KEY, dossier_id TEXT NOT NULL, version_number INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS person_dossier_versions_number_unique ON person_dossier_versions(dossier_id, version_number);
    CREATE TABLE IF NOT EXISTS person_dossier_sources (id TEXT PRIMARY KEY, dossier_version_id TEXT NOT NULL, url TEXT NOT NULL, kind TEXT NOT NULL, captured_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS person_dossier_claims (id TEXT PRIMARY KEY, dossier_version_id TEXT NOT NULL, statement TEXT NOT NULL, source_urls TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS person_relationship_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, dossier_id TEXT NOT NULL, event_type TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS content_person_dossiers (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, dossier_version_id TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  rebuildLegacyWorkToPostControls(sqlite);

  collapseDuplicatePlatformConnections(sqlite);
  try {
    sqlite
      .prepare(
        "UPDATE platforms SET config = NULL WHERE config IS NOT NULL AND json_valid(config) = 0"
      )
      .run();
  } catch (error) {
    console.warn("[db] could not repair malformed platform config:", error);
  }
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS platforms_account_identity_unique
    ON platforms(workspace_id, provider, type, account_id)
    WHERE workspace_id IS NOT NULL
      AND account_id IS NOT NULL
      AND account_id != '';
  `);
}

function checkIntegrity(sqlite: Database.Database): {
  ok: boolean;
  errors: string[];
} {
  const rows = sqlite
    .prepare("PRAGMA integrity_check")
    .all() as Array<{ integrity_check: string }>;

  const errors = rows
    .map((r) => r.integrity_check)
    .filter((msg) => msg !== "ok");

  return { ok: errors.length === 0, errors };
}

function checkCoreTables(sqlite: Database.Database): {
  ok: boolean;
  missing: string[];
} {
  const required = [
    "users",
    "organizations",
    "workspaces",
    "org_memberships",
    "workspace_memberships",
    "platforms",
    "posts",
    "schedules",
    "pipeline_runs",
  ];

  const missing: string[] = [];

  for (const table of required) {
    try {
      sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
    } catch {
      missing.push(table);
    }
  }

  return { ok: missing.length === 0, missing };
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

const integrity = checkIntegrity(sqlite);
if (!integrity.ok) {
  console.error(
    "[db] ⚠ integrity check failed:",
    integrity.errors.slice(0, 5).join("; ")
  );
}

const tables = checkCoreTables(sqlite);
if (!tables.ok) {
  console.error("[db] ⚠ unreadable tables:", tables.missing.join(", "));
}

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;
export { checkIntegrity, checkCoreTables, sqlite };
