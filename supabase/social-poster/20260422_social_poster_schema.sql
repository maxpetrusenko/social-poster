-- Social Poster Supabase bootstrap. Additive only. Do not run against public.
-- Generated from local SQLite schema inventory on 2026-04-22.
begin;
create schema if not exists social_poster;

create table if not exists social_poster."activity_log" (
  "id" text not null primary key,
  "workspace_id" text,
  "actor_user_id" text,
  "event_type" text not null,
  "severity" text default 'info' not null,
  "entity_type" text,
  "entity_id" text,
  "subject" text not null,
  "body" text default '' not null,
  "metadata" jsonb,
  "correlation_id" text,
  "dedupe_key" text,
  "source" text default 'app' not null,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."api_keys" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "name" text not null,
  "key_hash" text not null,
  "key_prefix" text not null,
  "key_suffix" text not null,
  "scope" text default 'all' not null,
  "permission" text default 'read' not null,
  "status" text default 'active' not null,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by" text not null,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."approval_requests" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "post_id" text not null,
  "post_variant_id" text,
  "status" text default 'requested' not null,
  "requested_by_user_id" text,
  "requested_for_role" text,
  "requested_for_email" text,
  "due_at" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "current_revision_id" text,
  "policy_snapshot" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."audit_events" (
  "id" text not null primary key,
  "organization_id" text,
  "workspace_id" text,
  "actor_user_id" text,
  "actor_email" text,
  "action" text not null,
  "target_type" text not null,
  "target_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."blog_automation_posts" (
  "id" text not null primary key,
  "topic" text not null,
  "slug" text not null,
  "title" text not null,
  "excerpt" text default '' not null,
  "category" text default 'Automation' not null,
  "status" text default 'draft' not null,
  "review_status" text default 'needs_review' not null,
  "publish_status" text default 'idle' not null,
  "direct_answer" text default '' not null,
  "thesis" text default '' not null,
  "content_markdown" text default '' not null,
  "hero_image_url" text,
  "hero_image_alt" text,
  "sources" jsonb,
  "framework_checks" jsonb,
  "validation_status" text default 'warn' not null,
  "validation_score" integer default 0 not null,
  "target_words" integer default 2000 not null,
  "scheduled_for" timestamp with time zone,
  "generated_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "medium_article_id" text,
  "medium_url" text,
  "external_draft_path" text,
  "last_error" text,
  "created_by_email" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."blog_automation_runs" (
  "id" text not null primary key,
  "post_id" text,
  "trigger" text not null,
  "phase" text not null,
  "status" text default 'running' not null,
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "started_at" timestamp with time zone not null,
  "completed_at" timestamp with time zone,
  "duration_ms" integer
);

create table if not exists social_poster."campaign_creatives" (
  "id" text not null primary key,
  "campaign_id" text not null,
  "generation_session_id" text,
  "title" text not null,
  "source_prompt" text default '' not null,
  "visual_spec" jsonb,
  "image_model" text default 'mock' not null,
  "source_image_url" text,
  "source_image_width" integer default 2048 not null,
  "source_image_height" integer default 2048 not null,
  "source_focal_point" jsonb,
  "source_safe_zone" jsonb,
  "score" jsonb,
  "status" text default 'draft' not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."campaign_events" (
  "id" text not null primary key,
  "campaign_id" text not null,
  "creative_id" text,
  "event_type" text not null,
  "payload" jsonb,
  "actor_user_id" text,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."campaign_generation_sessions" (
  "id" text not null primary key,
  "campaign_id" text not null,
  "status" text default 'pending' not null,
  "input_snapshot" jsonb,
  "model_config" jsonb,
  "result_summary" jsonb,
  "error" text,
  "ledger_path" text,
  "created_at" timestamp with time zone not null,
  "completed_at" timestamp with time zone
);

create table if not exists social_poster."campaign_layers" (
  "id" text not null primary key,
  "creative_id" text not null,
  "kind" text not null,
  "text" text default '' not null,
  "media_url" text,
  "x" integer default 0 not null,
  "y" integer default 0 not null,
  "width" integer default 0 not null,
  "height" integer default 0 not null,
  "rotation" integer default 0 not null,
  "font_family" text default '' not null,
  "font_size" integer default 0 not null,
  "line_height" integer default 0 not null,
  "color" text default '' not null,
  "background_color" text,
  "visible" boolean default true not null,
  "locked" boolean default false not null,
  "z_index" integer default 0 not null
);

create table if not exists social_poster."campaign_renditions" (
  "id" text not null primary key,
  "creative_id" text not null,
  "platform_type" text not null,
  "format" text default 'default' not null,
  "width" integer not null,
  "height" integer not null,
  "aspect_ratio" text not null,
  "crop" jsonb,
  "layer_overrides" jsonb,
  "exported_media_url" text,
  "validation" jsonb,
  "status" text default 'draft' not null,
  "post_id" text,
  "post_target_id" text,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."campaigns" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "profile_id" text not null,
  "owner_user_id" text,
  "name" text not null,
  "brief" text default '' not null,
  "objective" text default '' not null,
  "status" text default 'draft' not null,
  "selected_platforms" jsonb,
  "selected_creative_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."candidate_cache" (
  "link" text not null primary key,
  "title" text not null,
  "summary" text not null,
  "score" integer not null,
  "image_url" text,
  "og_image_url" text,
  "source_name" text,
  "published_at" timestamp with time zone,
  "fetched_at" timestamp with time zone not null
);

create table if not exists social_poster."dedup_cache" (
  "id" text not null primary key,
  "key" text not null,
  "source" text,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."drip_queue" (
  "id" text not null primary key,
  "user_id" text not null,
  "workspace_id" text not null,
  "email_key" text not null,
  "scheduled_at" timestamp with time zone not null,
  "sent_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."email_events" (
  "id" text not null primary key,
  "delivery_id" text,
  "provider" text not null,
  "provider_event_id" text not null,
  "event_type" text not null,
  "recipient_email" text,
  "external_message_id" text,
  "payload" jsonb,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."email_suppressions" (
  "id" text not null primary key,
  "email" text not null,
  "scope" text default 'marketing' not null,
  "reason" text not null,
  "provider" text,
  "event_id" text,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."inbox_conversations" (
  "id" text not null primary key,
  "workspace_id" text,
  "platform_id" text,
  "provider" text not null,
  "surface" text not null,
  "external_thread_id" text not null,
  "external_url" text,
  "subject" text,
  "status" text default 'needs_reply' not null,
  "priority" text default 'normal' not null,
  "assignee_user_id" text,
  "last_message_at" timestamp with time zone,
  "first_message_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."inbox_messages" (
  "id" text not null primary key,
  "conversation_id" text not null,
  "workspace_id" text,
  "platform_id" text,
  "surface" text not null,
  "provider_message_id" text not null,
  "direction" text default 'incoming' not null,
  "author_handle" text default '' not null,
  "author_name" text,
  "body" text not null,
  "source_url" text,
  "sent_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "read_at" timestamp with time zone
);

create table if not exists social_poster."inbox_seen_watermarks" (
  "id" text not null primary key,
  "workspace_id" text,
  "surface" text not null,
  "platform_key" text default 'all' not null,
  "seen_at" timestamp with time zone not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."lead_magnet_downloads" (
  "id" text not null primary key,
  "email" text not null,
  "lead_magnet_key" text not null,
  "source" text default 'landing' not null,
  "marketing_consent" boolean default false not null,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."magic_links" (
  "id" text not null primary key,
  "email" text not null,
  "token" text not null,
  "expires_at" timestamp with time zone not null,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."model_catalog" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "credential_id" text,
  "provider" text not null,
  "model_id" text not null,
  "display_name" text not null,
  "capabilities" jsonb,
  "context_window" integer,
  "input_price" text,
  "output_price" text,
  "status" text default 'available' not null,
  "source" text default 'discovered' not null,
  "deprecated_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."model_provider_credentials" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "provider" text not null,
  "label" text not null,
  "base_url" text,
  "protocol" text default 'openai_responses' not null,
  "encrypted_api_key" text not null,
  "encrypted_management_key" text,
  "key_prefix" text default '' not null,
  "key_suffix" text default '' not null,
  "status" text default 'untested' not null,
  "status_message" text default '' not null,
  "last_tested_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "metadata" jsonb,
  "created_by" text not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."notification_deliveries" (
  "id" text not null primary key,
  "notification_id" text,
  "channel" text default 'email' not null,
  "provider" text default 'resend' not null,
  "status" text default 'pending' not null,
  "attempt_count" integer default 0 not null,
  "external_message_id" text,
  "idempotency_key" text,
  "error_classification" text,
  "error_message" text,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "next_retry_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."notification_preferences" (
  "id" text not null primary key,
  "user_id" text not null,
  "workspace_id" text not null,
  "post_failures" boolean default true not null,
  "account_disconnects" boolean default true not null,
  "payment_alerts" boolean default true not null,
  "usage_alerts" boolean default true not null,
  "marketing_emails" boolean default true not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."notifications" (
  "id" text not null primary key,
  "workspace_id" text,
  "activity_log_id" text,
  "recipient_user_id" text not null,
  "channel" text default 'in_app' not null,
  "title" text not null,
  "body" text default '' not null,
  "severity" text default 'info' not null,
  "status" text default 'unread' not null,
  "read_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."org_memberships" (
  "id" text not null primary key,
  "user_id" text not null,
  "organization_id" text not null,
  "org_role" text default 'member' not null,
  "invited_at" timestamp with time zone not null,
  "accepted_at" timestamp with time zone
);

create table if not exists social_poster."organizations" (
  "id" text not null primary key,
  "name" text not null,
  "slug" text not null,
  "logo_url" text,
  "default_timezone" text default 'UTC' not null,
  "deletion_requested_at" timestamp with time zone,
  "deletion_scheduled_for" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null,
  "plan" text default 'free' not null,
  "plan_label" text default 'Free' not null,
  "max_profiles" integer default 5 not null,
  "max_platforms" integer default 3 not null,
  "max_posts_per_month" integer default 50 not null,
  "billing_email" text,
  "billing_cycle_start" timestamp with time zone
);

create table if not exists social_poster."pipeline_runs" (
  "id" text not null primary key,
  "schedule_id" text,
  "post_id" text,
  "trigger" text not null,
  "status" text default 'running' not null,
  "steps" jsonb,
  "error" text,
  "duration_ms" integer,
  "started_at" timestamp with time zone not null,
  "completed_at" timestamp with time zone,
  "workspace_id" text
);

create table if not exists social_poster."platforms" (
  "id" text not null primary key,
  "workspace_id" text,
  "name" text not null,
  "type" text not null,
  "handle" text,
  "account_id" text,
  "provider" text default 'zernio' not null,
  "config" jsonb,
  "enabled" boolean default true not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."post_targets" (
  "id" text not null primary key,
  "post_id" text not null,
  "platform_id" text not null,
  "status" text default 'pending' not null,
  "published_url" text,
  "platform_post_id" text,
  "error" text,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."posts" (
  "id" text not null primary key,
  "profile_id" text,
  "title" text,
  "content" text not null,
  "content_type" text default 'text' not null,
  "media_url" text,
  "source_url" text,
  "source_title" text,
  "status" text default 'draft' not null,
  "scheduled_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "dedup_key" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null,
  "workspace_id" text
);

create table if not exists social_poster."profiles" (
  "id" text not null primary key,
  "workspace_id" text,
  "name" text not null,
  "avatar_url" text,
  "bio" text,
  "voice_id" text,
  "face_id" text,
  "tone" text,
  "config" jsonb,
  "is_default" boolean default false not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."reply_candidates" (
  "id" text not null primary key,
  "platform_id" text,
  "tweet_id" text not null,
  "tweet_url" text not null,
  "reply_url" text,
  "author_handle" text not null,
  "author_name" text,
  "tweet_text" text not null,
  "hook" text,
  "status" text default 'drafted' not null,
  "risk_level" text default 'low' not null,
  "score" integer default 0 not null,
  "replies_scraped" integer default 0 not null,
  "tags" jsonb,
  "popular_replies" jsonb,
  "drafts" jsonb,
  "selected_draft_index" integer default 0 not null,
  "posted_at_label" text,
  "metadata" jsonb,
  "error" text,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null,
  "workspace_id" text
);

create table if not exists social_poster."reply_events" (
  "id" text not null primary key,
  "workspace_id" text,
  "run_id" text,
  "schedule_id" text,
  "platform_id" text,
  "tweet_url" text not null,
  "reply_url" text,
  "author_handle" text not null,
  "category" text,
  "lane" text not null,
  "reply_text" text,
  "status" text default 'sent' not null,
  "error" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."rss_settings" (
  "workspace_id" text not null primary key,
  "candidate_window_hours" integer default 48 not null,
  "candidate_pool_size" integer default 24 not null,
  "minimum_score" integer default 0 not null,
  "traction_weight" integer default 35 not null,
  "keyword_boost_terms" jsonb,
  "x_template" text not null,
  "linkedin_template" text not null,
  "transformation_prompt" text not null,
  "image_selection_mode" text default 'prefer_feed' not null,
  "image_selection_notes" text default '' not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."rss_sources" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "name" text not null,
  "url" text not null,
  "weight" integer default 10 not null,
  "enabled" boolean default true not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."schedules" (
  "id" text not null primary key,
  "workspace_id" text,
  "name" text not null,
  "description" text,
  "cron" text not null,
  "cron_human" text,
  "job_type" text not null,
  "profile_id" text,
  "target_platform_ids" jsonb,
  "config" jsonb,
  "enabled" boolean default true not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."sessions" (
  "id" text not null primary key,
  "email" text not null,
  "token" text not null,
  "expires_at" timestamp with time zone not null,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."source_evidence" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "source_feed_id" text,
  "type" text not null,
  "title" text not null,
  "summary" text not null,
  "url" text,
  "external_id" text,
  "event_at" timestamp with time zone,
  "dedupe_key" text not null,
  "status" text default 'new' not null,
  "metadata" jsonb,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."source_feeds" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "type" text not null,
  "name" text not null,
  "config" jsonb,
  "enabled" boolean default true not null,
  "last_checked_at" timestamp with time zone,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."usage_events" (
  "id" text not null primary key,
  "workspace_id" text not null,
  "platform_id" text,
  "event_type" text not null,
  "metadata" text,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."user_ui_preferences" (
  "id" text not null primary key,
  "user_id" text not null,
  "workspace_id" text not null,
  "product_mode" text default 'saas' not null,
  "agent_dock_mode" text default 'right-widget' not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."users" (
  "id" text not null primary key,
  "email" text not null,
  "full_name" text,
  "avatar_url" text,
  "auth_provider" text default 'magic_link' not null,
  "provider_user_id" text,
  "last_workspace_id" text,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."waitlist_signups" (
  "id" text not null primary key,
  "email" text not null,
  "source" text default 'landing' not null,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."workspace_invitations" (
  "id" text not null primary key,
  "organization_id" text not null,
  "email" text not null,
  "org_role" text default 'member' not null,
  "workspace_assignments" jsonb,
  "invited_by_user_id" text,
  "token" text not null,
  "expires_at" timestamp with time zone not null,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone not null
);

create table if not exists social_poster."workspace_memberships" (
  "id" text not null primary key,
  "user_id" text not null,
  "workspace_id" text not null,
  "workspace_role" text default 'viewer' not null,
  "added_at" timestamp with time zone not null
);

create table if not exists social_poster."workspace_model_defaults" (
  "workspace_id" text not null primary key,
  "writing_model_catalog_id" text,
  "reply_model_catalog_id" text,
  "agent_model_catalog_id" text,
  "fast_model_catalog_id" text,
  "image_model_catalog_id" text,
  "embedding_model_catalog_id" text,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

create table if not exists social_poster."workspaces" (
  "id" text not null primary key,
  "organization_id" text not null,
  "name" text not null,
  "slug" text not null,
  "description" text default '' not null,
  "timezone" text default '' not null,
  "icon_url" text,
  "primary_color" text default '' not null,
  "secondary_color" text default '' not null,
  "default_hashtags" jsonb,
  "default_first_comment" text default '' not null,
  "approval_workflow_mode" text default 'none' not null,
  "is_archived" boolean default false not null,
  "created_at" timestamp with time zone not null,
  "updated_at" timestamp with time zone not null
);

alter table social_poster."activity_log" add constraint "activity_log_actor_user_id_fkey" foreign key ("actor_user_id") references social_poster."users"("id") on delete set null;
alter table social_poster."activity_log" add constraint "activity_log_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."api_keys" add constraint "api_keys_created_by_fkey" foreign key ("created_by") references social_poster."users"("id");
alter table social_poster."api_keys" add constraint "api_keys_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id");
alter table social_poster."approval_requests" add constraint "approval_requests_requested_by_user_id_fkey" foreign key ("requested_by_user_id") references social_poster."users"("id") on delete set null;
alter table social_poster."approval_requests" add constraint "approval_requests_post_id_fkey" foreign key ("post_id") references social_poster."posts"("id") on delete cascade;
alter table social_poster."approval_requests" add constraint "approval_requests_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."audit_events" add constraint "audit_events_actor_user_id_fkey" foreign key ("actor_user_id") references social_poster."users"("id") on delete set null;
alter table social_poster."audit_events" add constraint "audit_events_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."audit_events" add constraint "audit_events_organization_id_fkey" foreign key ("organization_id") references social_poster."organizations"("id") on delete set null;
alter table social_poster."blog_automation_runs" add constraint "blog_automation_runs_post_id_fkey" foreign key ("post_id") references social_poster."blog_automation_posts"("id") on delete set null;
alter table social_poster."campaign_creatives" add constraint "campaign_creatives_generation_session_id_fkey" foreign key ("generation_session_id") references social_poster."campaign_generation_sessions"("id") on delete set null;
alter table social_poster."campaign_creatives" add constraint "campaign_creatives_campaign_id_fkey" foreign key ("campaign_id") references social_poster."campaigns"("id") on delete cascade;
alter table social_poster."campaign_events" add constraint "campaign_events_actor_user_id_fkey" foreign key ("actor_user_id") references social_poster."users"("id") on delete set null;
alter table social_poster."campaign_events" add constraint "campaign_events_creative_id_fkey" foreign key ("creative_id") references social_poster."campaign_creatives"("id") on delete set null;
alter table social_poster."campaign_events" add constraint "campaign_events_campaign_id_fkey" foreign key ("campaign_id") references social_poster."campaigns"("id") on delete cascade;
alter table social_poster."campaign_generation_sessions" add constraint "campaign_generation_sessions_campaign_id_fkey" foreign key ("campaign_id") references social_poster."campaigns"("id") on delete cascade;
alter table social_poster."campaign_layers" add constraint "campaign_layers_creative_id_fkey" foreign key ("creative_id") references social_poster."campaign_creatives"("id") on delete cascade;
alter table social_poster."campaign_renditions" add constraint "campaign_renditions_creative_id_fkey" foreign key ("creative_id") references social_poster."campaign_creatives"("id") on delete cascade;
alter table social_poster."campaigns" add constraint "campaigns_owner_user_id_fkey" foreign key ("owner_user_id") references social_poster."users"("id") on delete set null;
alter table social_poster."campaigns" add constraint "campaigns_profile_id_fkey" foreign key ("profile_id") references social_poster."profiles"("id") on delete cascade;
alter table social_poster."campaigns" add constraint "campaigns_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."drip_queue" add constraint "drip_queue_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."drip_queue" add constraint "drip_queue_user_id_fkey" foreign key ("user_id") references social_poster."users"("id") on delete cascade;
alter table social_poster."email_events" add constraint "email_events_delivery_id_fkey" foreign key ("delivery_id") references social_poster."notification_deliveries"("id") on delete set null;
alter table social_poster."inbox_conversations" add constraint "inbox_conversations_assignee_user_id_fkey" foreign key ("assignee_user_id") references social_poster."users"("id") on delete set null;
alter table social_poster."inbox_conversations" add constraint "inbox_conversations_platform_id_fkey" foreign key ("platform_id") references social_poster."platforms"("id") on delete set null;
alter table social_poster."inbox_conversations" add constraint "inbox_conversations_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."inbox_messages" add constraint "inbox_messages_platform_id_fkey" foreign key ("platform_id") references social_poster."platforms"("id") on delete set null;
alter table social_poster."inbox_messages" add constraint "inbox_messages_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."inbox_messages" add constraint "inbox_messages_conversation_id_fkey" foreign key ("conversation_id") references social_poster."inbox_conversations"("id") on delete cascade;
alter table social_poster."inbox_seen_watermarks" add constraint "inbox_seen_watermarks_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."model_catalog" add constraint "model_catalog_credential_id_fkey" foreign key ("credential_id") references social_poster."model_provider_credentials"("id") on delete cascade;
alter table social_poster."model_catalog" add constraint "model_catalog_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."model_provider_credentials" add constraint "model_provider_credentials_created_by_fkey" foreign key ("created_by") references social_poster."users"("id");
alter table social_poster."model_provider_credentials" add constraint "model_provider_credentials_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."notification_deliveries" add constraint "notification_deliveries_notification_id_fkey" foreign key ("notification_id") references social_poster."notifications"("id") on delete cascade;
alter table social_poster."notification_preferences" add constraint "notification_preferences_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id");
alter table social_poster."notification_preferences" add constraint "notification_preferences_user_id_fkey" foreign key ("user_id") references social_poster."users"("id");
alter table social_poster."notifications" add constraint "notifications_recipient_user_id_fkey" foreign key ("recipient_user_id") references social_poster."users"("id") on delete cascade;
alter table social_poster."notifications" add constraint "notifications_activity_log_id_fkey" foreign key ("activity_log_id") references social_poster."activity_log"("id") on delete cascade;
alter table social_poster."notifications" add constraint "notifications_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."org_memberships" add constraint "org_memberships_organization_id_fkey" foreign key ("organization_id") references social_poster."organizations"("id") on delete cascade;
alter table social_poster."org_memberships" add constraint "org_memberships_user_id_fkey" foreign key ("user_id") references social_poster."users"("id") on delete cascade;
alter table social_poster."pipeline_runs" add constraint "pipeline_runs_post_id_fkey" foreign key ("post_id") references social_poster."posts"("id");
alter table social_poster."pipeline_runs" add constraint "pipeline_runs_schedule_id_fkey" foreign key ("schedule_id") references social_poster."schedules"("id");
alter table social_poster."platforms" add constraint "platforms_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."post_targets" add constraint "post_targets_platform_id_fkey" foreign key ("platform_id") references social_poster."platforms"("id");
alter table social_poster."post_targets" add constraint "post_targets_post_id_fkey" foreign key ("post_id") references social_poster."posts"("id") on delete cascade;
alter table social_poster."posts" add constraint "posts_profile_id_fkey" foreign key ("profile_id") references social_poster."profiles"("id");
alter table social_poster."profiles" add constraint "profiles_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."reply_candidates" add constraint "reply_candidates_platform_id_fkey" foreign key ("platform_id") references social_poster."platforms"("id") on delete set null;
alter table social_poster."reply_events" add constraint "reply_events_platform_id_fkey" foreign key ("platform_id") references social_poster."platforms"("id") on delete set null;
alter table social_poster."reply_events" add constraint "reply_events_schedule_id_fkey" foreign key ("schedule_id") references social_poster."schedules"("id") on delete set null;
alter table social_poster."reply_events" add constraint "reply_events_run_id_fkey" foreign key ("run_id") references social_poster."pipeline_runs"("id") on delete set null;
alter table social_poster."reply_events" add constraint "reply_events_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."rss_settings" add constraint "rss_settings_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."rss_sources" add constraint "rss_sources_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."schedules" add constraint "schedules_profile_id_fkey" foreign key ("profile_id") references social_poster."profiles"("id");
alter table social_poster."schedules" add constraint "schedules_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete set null;
alter table social_poster."source_evidence" add constraint "source_evidence_source_feed_id_fkey" foreign key ("source_feed_id") references social_poster."source_feeds"("id") on delete set null;
alter table social_poster."source_evidence" add constraint "source_evidence_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."source_feeds" add constraint "source_feeds_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."usage_events" add constraint "usage_events_platform_id_fkey" foreign key ("platform_id") references social_poster."platforms"("id");
alter table social_poster."usage_events" add constraint "usage_events_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id");
alter table social_poster."user_ui_preferences" add constraint "user_ui_preferences_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id");
alter table social_poster."user_ui_preferences" add constraint "user_ui_preferences_user_id_fkey" foreign key ("user_id") references social_poster."users"("id");
alter table social_poster."workspace_invitations" add constraint "workspace_invitations_invited_by_user_id_fkey" foreign key ("invited_by_user_id") references social_poster."users"("id") on delete set null;
alter table social_poster."workspace_invitations" add constraint "workspace_invitations_organization_id_fkey" foreign key ("organization_id") references social_poster."organizations"("id") on delete cascade;
alter table social_poster."workspace_memberships" add constraint "workspace_memberships_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."workspace_memberships" add constraint "workspace_memberships_user_id_fkey" foreign key ("user_id") references social_poster."users"("id") on delete cascade;
alter table social_poster."workspace_model_defaults" add constraint "workspace_model_defaults_embedding_model_catalog_id_fke" foreign key ("embedding_model_catalog_id") references social_poster."model_catalog"("id") on delete set null;
alter table social_poster."workspace_model_defaults" add constraint "workspace_model_defaults_image_model_catalog_id_fkey" foreign key ("image_model_catalog_id") references social_poster."model_catalog"("id") on delete set null;
alter table social_poster."workspace_model_defaults" add constraint "workspace_model_defaults_fast_model_catalog_id_fkey" foreign key ("fast_model_catalog_id") references social_poster."model_catalog"("id") on delete set null;
alter table social_poster."workspace_model_defaults" add constraint "workspace_model_defaults_agent_model_catalog_id_fkey" foreign key ("agent_model_catalog_id") references social_poster."model_catalog"("id") on delete set null;
alter table social_poster."workspace_model_defaults" add constraint "workspace_model_defaults_reply_model_catalog_id_fkey" foreign key ("reply_model_catalog_id") references social_poster."model_catalog"("id") on delete set null;
alter table social_poster."workspace_model_defaults" add constraint "workspace_model_defaults_writing_model_catalog_id_fkey" foreign key ("writing_model_catalog_id") references social_poster."model_catalog"("id") on delete set null;
alter table social_poster."workspace_model_defaults" add constraint "workspace_model_defaults_workspace_id_fkey" foreign key ("workspace_id") references social_poster."workspaces"("id") on delete cascade;
alter table social_poster."workspaces" add constraint "workspaces_organization_id_fkey" foreign key ("organization_id") references social_poster."organizations"("id") on delete cascade;

create unique index if not exists "activity_log_workspace_dedupe_idx" on social_poster."activity_log" ("workspace_id", "dedupe_key") where dedupe_key IS NOT NULL AND dedupe_key != '';
create index if not exists "approval_requests_workspace_status_idx" on social_poster."approval_requests" ("workspace_id", "status");
create index if not exists "approval_requests_workspace_post_idx" on social_poster."approval_requests" ("workspace_id", "post_id");
create index if not exists "audit_events_workspace_created_idx" on social_poster."audit_events" ("workspace_id", "created_at");
create index if not exists "audit_events_org_created_idx" on social_poster."audit_events" ("organization_id", "created_at");
create index if not exists "blog_automation_posts_published_idx" on social_poster."blog_automation_posts" ("publish_status", "published_at");
create index if not exists "blog_automation_posts_status_idx" on social_poster."blog_automation_posts" ("status", "publish_status", "created_at");
create unique index if not exists "blog_automation_posts_slug_unique_idx" on social_poster."blog_automation_posts" ("slug");
create index if not exists "blog_automation_runs_post_idx" on social_poster."blog_automation_runs" ("post_id", "started_at");
create index if not exists "campaign_creatives_campaign_idx" on social_poster."campaign_creatives" ("campaign_id");
create index if not exists "campaign_events_campaign_idx" on social_poster."campaign_events" ("campaign_id", "created_at");
create index if not exists "campaign_generation_sessions_campaign_idx" on social_poster."campaign_generation_sessions" ("campaign_id");
create index if not exists "campaign_layers_creative_idx" on social_poster."campaign_layers" ("creative_id");
create index if not exists "campaign_renditions_creative_idx" on social_poster."campaign_renditions" ("creative_id");
create index if not exists "campaigns_workspace_profile_idx" on social_poster."campaigns" ("workspace_id", "profile_id");
create unique index if not exists "dedup_cache_key_unique" on social_poster."dedup_cache" ("key");
create unique index if not exists "dedup_cache_key_unique_idx" on social_poster."dedup_cache" ("key");
create index if not exists "drip_queue_due_idx" on social_poster."drip_queue" ("scheduled_at", "sent_at", "cancelled_at");
create unique index if not exists "drip_queue_user_email_key_idx" on social_poster."drip_queue" ("user_id", "email_key");
create index if not exists "email_events_message_idx" on social_poster."email_events" ("external_message_id", "event_type");
create unique index if not exists "email_events_provider_event_idx" on social_poster."email_events" ("provider", "provider_event_id");
create unique index if not exists "email_suppressions_email_scope_idx" on social_poster."email_suppressions" ("email", "scope");
create unique index if not exists "inbox_conversations_external_unique" on social_poster."inbox_conversations" ("workspace_id", "platform_id", "surface", "external_thread_id") where workspace_id IS NOT NULL AND platform_id IS NOT NULL;
create index if not exists "inbox_messages_workspace_surface_idx" on social_poster."inbox_messages" ("workspace_id", "surface", "created_at");
create unique index if not exists "inbox_messages_provider_unique" on social_poster."inbox_messages" ("conversation_id", "provider_message_id");
create unique index if not exists "inbox_seen_watermarks_workspace_surface_platform_idx" on social_poster."inbox_seen_watermarks" ("workspace_id", "surface", "platform_key") where workspace_id IS NOT NULL;
create index if not exists "lead_magnet_downloads_email_idx" on social_poster."lead_magnet_downloads" ("email", "created_at");
create unique index if not exists "magic_links_token_unique" on social_poster."magic_links" ("token");
create unique index if not exists "magic_links_token_unique_idx" on social_poster."magic_links" ("token");
create index if not exists "model_catalog_workspace_idx" on social_poster."model_catalog" ("workspace_id");
create unique index if not exists "model_catalog_workspace_model_unique" on social_poster."model_catalog" ("workspace_id", "provider", "model_id");
create index if not exists "model_provider_workspace_idx" on social_poster."model_provider_credentials" ("workspace_id");
create index if not exists "notification_deliveries_status_idx" on social_poster."notification_deliveries" ("status", "next_retry_at");
create unique index if not exists "notification_deliveries_idempotency_idx" on social_poster."notification_deliveries" ("idempotency_key") where idempotency_key IS NOT NULL AND idempotency_key != '';
create unique index if not exists "notification_prefs_user_workspace_idx" on social_poster."notification_preferences" ("user_id", "workspace_id");
create index if not exists "notifications_recipient_status_idx" on social_poster."notifications" ("recipient_user_id", "status", "created_at");
create unique index if not exists "org_memberships_user_org_idx" on social_poster."org_memberships" ("user_id", "organization_id");
create unique index if not exists "organizations_slug_idx" on social_poster."organizations" ("slug");
create unique index if not exists "organizations_slug_unique" on social_poster."organizations" ("slug");
create unique index if not exists "organizations_slug_unique_idx" on social_poster."organizations" ("slug");
create unique index if not exists "platforms_account_identity_unique" on social_poster."platforms" ("workspace_id", "provider", "type", "account_id") where workspace_id IS NOT NULL
      AND account_id IS NOT NULL
      AND account_id != '';
create unique index if not exists "reply_candidates_tweet_url_unique_idx" on social_poster."reply_candidates" ("tweet_url");
create unique index if not exists "rss_sources_workspace_url_idx" on social_poster."rss_sources" ("workspace_id", "url");
create unique index if not exists "sessions_token_unique" on social_poster."sessions" ("token");
create unique index if not exists "sessions_token_unique_idx" on social_poster."sessions" ("token");
create unique index if not exists "source_evidence_external_idx" on social_poster."source_evidence" ("workspace_id", "source_feed_id", "external_id") where external_id IS NOT NULL AND external_id != '';
create unique index if not exists "source_evidence_workspace_dedupe_idx" on social_poster."source_evidence" ("workspace_id", "dedupe_key") where dedupe_key IS NOT NULL AND dedupe_key != '';
create unique index if not exists "source_feeds_workspace_name_unique" on social_poster."source_feeds" ("workspace_id", "type", "name");
create index if not exists "usage_events_created_idx" on social_poster."usage_events" ("workspace_id", "created_at");
create index if not exists "usage_events_workspace_type_idx" on social_poster."usage_events" ("workspace_id", "event_type");
create unique index if not exists "user_ui_prefs_user_workspace_idx" on social_poster."user_ui_preferences" ("user_id", "workspace_id");
create unique index if not exists "users_email_idx" on social_poster."users" ("email");
create unique index if not exists "users_email_unique" on social_poster."users" ("email");
create unique index if not exists "users_email_unique_idx" on social_poster."users" ("email");
create unique index if not exists "waitlist_signups_email_unique" on social_poster."waitlist_signups" ("email");
create unique index if not exists "workspace_invitations_token_unique_idx" on social_poster."workspace_invitations" ("token");
create unique index if not exists "workspace_memberships_user_workspace_idx" on social_poster."workspace_memberships" ("user_id", "workspace_id");
create unique index if not exists "workspaces_org_slug_idx" on social_poster."workspaces" ("organization_id", "slug");

commit;
