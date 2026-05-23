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
