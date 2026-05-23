import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  authProvider: text("auth_provider").notNull().default("magic_link"),
  providerUserId: text("provider_user_id"),
  lastWorkspaceId: text("last_workspace_id"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  defaultTimezone: text("default_timezone").notNull().default("UTC"),
  plan: text("plan").notNull().default("free"), // "free" | "starter" | "pro" | "business"
  planLabel: text("plan_label").notNull().default("Free"),
  maxProfiles: integer("max_profiles").notNull().default(5),
  maxPlatforms: integer("max_platforms").notNull().default(3),
  maxPostsPerMonth: integer("max_posts_per_month").notNull().default(50),
  billingEmail: text("billing_email"),
  billingCycleStart: integer("billing_cycle_start", { mode: "timestamp" }),
  deletionRequestedAt: integer("deletion_requested_at", { mode: "timestamp" }),
  deletionScheduledFor: integer("deletion_scheduled_for", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  timezone: text("timezone").notNull().default(""),
  iconUrl: text("icon_url"),
  primaryColor: text("primary_color").notNull().default(""),
  secondaryColor: text("secondary_color").notNull().default(""),
  defaultHashtags: text("default_hashtags", { mode: "json" }).$type<string[]>(),
  defaultFirstComment: text("default_first_comment").notNull().default(""),
  approvalWorkflowMode: text("approval_workflow_mode").notNull().default("none"),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const orgMemberships = sqliteTable("org_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  orgRole: text("org_role").notNull().default("member"),
  invitedAt: integer("invited_at", { mode: "timestamp" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
});

export const workspaceMemberships = sqliteTable("workspace_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workspaceRole: text("workspace_role").notNull().default("viewer"),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
});

export const workspaceInvitations = sqliteTable("workspace_invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  orgRole: text("org_role").notNull().default("member"),
  workspaceAssignments: text("workspace_assignments", { mode: "json" }).$type<
    Array<{ workspaceId: string; role: string }>
  >(),
  invitedByUserId: text("invited_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Auth ──────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Platforms ─────────────────────────────────────────────────────────
// Each connected social account (X, LinkedIn, TikTok, IG, etc.)
export const platforms = sqliteTable("platforms", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(), // "X (Main)", "LinkedIn", etc.
  type: text("type").notNull(), // see PLATFORM_TYPES in src/lib/platforms.ts
  handle: text("handle"), // @maxpetrusenko
  accountId: text("account_id"), // Zernio account ID
  provider: text("provider").notNull().default("zernio"), // "zernio" | "bird" | "direct"
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(), // provider-specific config
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("platforms_account_identity_unique")
    .on(table.workspaceId, table.provider, table.type, table.accountId)
    .where(sql`workspace_id IS NOT NULL AND account_id IS NOT NULL AND account_id != ''`),
]);

export const platformCapabilities = sqliteTable("platform_capabilities", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  platformId: text("platform_id").notNull().references(() => platforms.id, {
    onDelete: "cascade",
  }),
  capability: text("capability").notNull(),
  status: text("status").notNull().default("unknown"),
  confidence: text("confidence").notNull().default("provider_default"),
  source: text("source").notNull().default("provider_default"),
  evidence: text("evidence", { mode: "json" }).$type<Record<string, unknown>>(),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  lastObservedAt: integer("last_observed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("platform_capabilities_platform_capability_unique").on(
    table.platformId,
    table.capability
  ),
  index("platform_capabilities_workspace_idx").on(table.workspaceId),
]);

// ── Social Profile ────────────────────────────────────────────────────
// Your brand identity / voice settings
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(), // "Max Petrusenko" or "AI News Bot"
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  voiceId: text("voice_id"), // Cartesia voice ID
  faceId: text("face_id"), // Simli face ID
  tone: text("tone"), // "professional", "casual", "technical"
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Campaigns ────────────────────────────────────────────────────────
export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  brief: text("brief").notNull().default(""),
  objective: text("objective").notNull().default(""),
  status: text("status").notNull().default("draft"), // "draft" | "generating" | "review" | "approved" | "scheduled" | "archived"
  selectedPlatforms: text("selected_platforms", { mode: "json" }).$type<string[]>(),
  selectedCreativeId: text("selected_creative_id"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("campaigns_workspace_profile_idx").on(table.workspaceId, table.profileId),
]);

export const campaignGenerationSessions = sqliteTable("campaign_generation_sessions", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // "pending" | "running" | "completed" | "failed" | "canceled"
  inputSnapshot: text("input_snapshot", { mode: "json" }).$type<Record<string, unknown>>(),
  modelConfig: text("model_config", { mode: "json" }).$type<Record<string, unknown>>(),
  resultSummary: text("result_summary", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  ledgerPath: text("ledger_path"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (table) => [
  index("campaign_generation_sessions_campaign_idx").on(table.campaignId),
]);

export const campaignCreatives = sqliteTable("campaign_creatives", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  generationSessionId: text("generation_session_id").references(() => campaignGenerationSessions.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  sourcePrompt: text("source_prompt").notNull().default(""),
  visualSpec: text("visual_spec", { mode: "json" }).$type<Record<string, unknown>>(),
  imageModel: text("image_model").notNull().default("mock"),
  sourceImageUrl: text("source_image_url"),
  sourceImageWidth: integer("source_image_width").notNull().default(2048),
  sourceImageHeight: integer("source_image_height").notNull().default(2048),
  sourceFocalPoint: text("source_focal_point", { mode: "json" }).$type<Record<string, unknown>>(),
  sourceSafeZone: text("source_safe_zone", { mode: "json" }).$type<Record<string, unknown>>(),
  score: text("score", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status").notNull().default("draft"), // "draft" | "review" | "approved" | "denied" | "archived"
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("campaign_creatives_campaign_idx").on(table.campaignId),
]);

export const campaignLayers = sqliteTable("campaign_layers", {
  id: text("id").primaryKey(),
  creativeId: text("creative_id")
    .notNull()
    .references(() => campaignCreatives.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "image" | "header" | "description" | "cta" | "logo" | "shape"
  text: text("text").notNull().default(""),
  mediaUrl: text("media_url"),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  rotation: integer("rotation").notNull().default(0),
  fontFamily: text("font_family").notNull().default(""),
  fontSize: integer("font_size").notNull().default(0),
  lineHeight: integer("line_height").notNull().default(0),
  color: text("color").notNull().default(""),
  backgroundColor: text("background_color"),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  zIndex: integer("z_index").notNull().default(0),
}, (table) => [
  index("campaign_layers_creative_idx").on(table.creativeId),
]);

export const campaignRenditions = sqliteTable("campaign_renditions", {
  id: text("id").primaryKey(),
  creativeId: text("creative_id")
    .notNull()
    .references(() => campaignCreatives.id, { onDelete: "cascade" }),
  platformType: text("platform_type").notNull(),
  format: text("format").notNull().default("default"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  crop: text("crop", { mode: "json" }).$type<Record<string, unknown>>(),
  layerOverrides: text("layer_overrides", { mode: "json" }).$type<Record<string, unknown>>(),
  exportedMediaUrl: text("exported_media_url"),
  validation: text("validation", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status").notNull().default("draft"), // "draft" | "ready" | "applied" | "failed"
  postId: text("post_id"),
  postTargetId: text("post_target_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("campaign_renditions_creative_idx").on(table.creativeId),
]);

export const campaignEvents = sqliteTable("campaign_events", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  creativeId: text("creative_id").references(() => campaignCreatives.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type").notNull(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("campaign_events_campaign_idx").on(table.campaignId, table.createdAt),
]);

// ── Posts ──────────────────────────────────────────────────────────────
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
  profileId: text("profile_id").references(() => profiles.id),
  title: text("title"),
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("text"), // "text" | "image" | "video" | "avatar_video"
  mediaUrl: text("media_url"),
  sourceUrl: text("source_url"), // news article URL
  sourceTitle: text("source_title"),
  status: text("status").notNull().default("draft"), // "draft" | "scheduled" | "publishing" | "published" | "failed"
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  dedupKey: text("dedup_key"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Approval Requests ────────────────────────────────────────────────
export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  postVariantId: text("post_variant_id"),
  status: text("status").notNull().default("requested"), // "requested" | "in_review" | "changes_requested" | "approved" | "rejected" | "withdrawn" | "expired"
  requestedByUserId: text("requested_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  requestedForRole: text("requested_for_role"),
  requestedForEmail: text("requested_for_email"),
  dueAt: integer("due_at", { mode: "timestamp" }),
  openedAt: integer("opened_at", { mode: "timestamp" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  currentRevisionId: text("current_revision_id"),
  policySnapshot: text("policy_snapshot", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("approval_requests_workspace_post_idx").on(table.workspaceId, table.postId),
  index("approval_requests_workspace_status_idx").on(table.workspaceId, table.status),
]);

// ── Post Targets ──────────────────────────────────────────────────────
// Many-to-many: which platforms a post goes to + per-platform status
export const postTargets = sqliteTable("post_targets", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  platformId: text("platform_id").notNull().references(() => platforms.id),
  status: text("status").notNull().default("pending"), // "pending" | "publishing" | "published" | "failed" | "skipped"
  publishedUrl: text("published_url"),
  platformPostId: text("platform_post_id"),
  error: text("error"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Schedule (cron jobs config) ───────────────────────────────────────
export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  cron: text("cron").notNull(), // "0 9 * * *"
  cronHuman: text("cron_human"), // "Every day at 9 AM ET"
  jobType: text("job_type").notNull(), // "avatar_video" | "image_post" | "text_post"
  profileId: text("profile_id").references(() => profiles.id),
  targetPlatformIds: text("target_platform_ids", { mode: "json" }).$type<string[]>(), // platform IDs to post to
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(), // job-specific config
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Source-backed posting ────────────────────────────────────────────
export const sourceFeeds = sqliteTable("source_feeds", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "github_repo" | "github_org" | "rss" | "url" | "manual_note" | "local_repo"
  name: text("name").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("source_feeds_workspace_name_unique")
    .on(table.workspaceId, table.type, table.name),
]);

export const sourceEvidence = sqliteTable("source_evidence", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  sourceFeedId: text("source_feed_id").references(() => sourceFeeds.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(), // "commit" | "pr" | "release" | "issue" | "docs_change" | "rss_item" | "url" | "note"
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  url: text("url"),
  externalId: text("external_id"),
  eventAt: integer("event_at", { mode: "timestamp" }),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("new"), // "new" | "drafted" | "rejected" | "used" | "stale"
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("source_evidence_workspace_dedupe_idx")
    .on(table.workspaceId, table.dedupeKey)
    .where(sql`dedupe_key IS NOT NULL AND dedupe_key != ''`),
  uniqueIndex("source_evidence_external_idx")
    .on(table.workspaceId, table.sourceFeedId, table.externalId)
    .where(sql`external_id IS NOT NULL AND external_id != ''`),
]);

// ── Pipeline Runs ─────────────────────────────────────────────────────
export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
  scheduleId: text("schedule_id").references(() => schedules.id),
  postId: text("post_id").references(() => posts.id),
  trigger: text("trigger").notNull(), // "cron" | "manual" | "api"
  status: text("status").notNull().default("running"), // "running" | "completed" | "failed"
  steps: text("steps", { mode: "json" }).$type<PipelineStep[]>(),
  error: text("error"),
  durationMs: integer("duration_ms"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ── Reply Events ──────────────────────────────────────────────────────
export const replyEvents = sqliteTable("reply_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
  runId: text("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  scheduleId: text("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  tweetUrl: text("tweet_url").notNull(),
  replyUrl: text("reply_url"),
  authorHandle: text("author_handle").notNull(),
  category: text("category"),
  lane: text("lane").notNull(),
  replyText: text("reply_text"),
  status: text("status").notNull().default("sent"), // "pending" | "sent" | "failed" | "skipped"
  error: text("error"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("reply_events_tweet_url_sent_unique")
    .on(table.tweetUrl)
    .where(sql`status IN ('sent', 'pending')`),
]);

export const replyCandidates = sqliteTable("reply_candidates", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  tweetId: text("tweet_id").notNull(),
  tweetUrl: text("tweet_url").notNull().unique(),
  replyUrl: text("reply_url"),
  authorHandle: text("author_handle").notNull(),
  authorName: text("author_name"),
  tweetText: text("tweet_text").notNull(),
  hook: text("hook"),
  status: text("status").notNull().default("drafted"),
  riskLevel: text("risk_level").notNull().default("low"),
  score: integer("score").notNull().default(0),
  repliesScraped: integer("replies_scraped").notNull().default(0),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  popularReplies: text("popular_replies", { mode: "json" }).$type<
    Array<{ author: string; handle: string; text: string; likes: number }>
  >(),
  drafts: text("drafts", { mode: "json" }).$type<string[]>(),
  selectedDraftIndex: integer("selected_draft_index").notNull().default(0),
  postedAtLabel: text("posted_at_label"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Social Inbox ─────────────────────────────────────────────────────
export const inboxConversations = sqliteTable("inbox_conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  platformId: text("platform_id").references(() => platforms.id, {
    onDelete: "set null",
  }),
  provider: text("provider").notNull(),
  surface: text("surface").notNull(), // "replies" | "comments" | "dms"
  externalThreadId: text("external_thread_id").notNull(),
  externalUrl: text("external_url"),
  subject: text("subject"),
  status: text("status").notNull().default("needs_reply"),
  priority: text("priority").notNull().default("normal"),
  assigneeUserId: text("assignee_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }),
  firstMessageAt: integer("first_message_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("inbox_conversations_external_unique")
    .on(table.workspaceId, table.platformId, table.surface, table.externalThreadId)
    .where(sql`workspace_id IS NOT NULL AND platform_id IS NOT NULL`),
]);

export const inboxMessages = sqliteTable("inbox_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => inboxConversations.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  platformId: text("platform_id").references(() => platforms.id, {
    onDelete: "set null",
  }),
  surface: text("surface").notNull(),
  providerMessageId: text("provider_message_id").notNull(),
  direction: text("direction").notNull().default("incoming"),
  authorHandle: text("author_handle").notNull().default(""),
  authorName: text("author_name"),
  body: text("body").notNull(),
  sourceUrl: text("source_url"),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  readAt: integer("read_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("inbox_messages_provider_unique")
    .on(table.conversationId, table.providerMessageId),
]);

export const inboxSeenWatermarks = sqliteTable("inbox_seen_watermarks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  surface: text("surface").notNull(),
  platformKey: text("platform_key").notNull().default("all"),
  seenAt: integer("seen_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("inbox_seen_watermarks_workspace_surface_platform_idx")
    .on(table.workspaceId, table.surface, table.platformKey)
    .where(sql`workspace_id IS NOT NULL`),
]);

// ── Dedup Cache ───────────────────────────────────────────────────────
export const dedupCache = sqliteTable("dedup_cache", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Candidate Cache ───────────────────────────────────────────────────
export const candidateCache = sqliteTable("candidate_cache", {
  link: text("link").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  score: integer("score").notNull(),
  imageUrl: text("image_url"),
  ogImageUrl: text("og_image_url"),
  sourceName: text("source_name"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export const rssSources = sqliteTable("rss_sources", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  weight: integer("weight").notNull().default(10),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const rssSettings = sqliteTable("rss_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  candidateWindowHours: integer("candidate_window_hours").notNull().default(48),
  candidatePoolSize: integer("candidate_pool_size").notNull().default(24),
  minimumScore: integer("minimum_score").notNull().default(0),
  tractionWeight: integer("traction_weight").notNull().default(35),
  keywordBoostTerms: text("keyword_boost_terms", { mode: "json" }).$type<string[]>(),
  xTemplate: text("x_template").notNull(),
  linkedinTemplate: text("linkedin_template").notNull(),
  transformationPrompt: text("transformation_prompt").notNull(),
  imageSelectionMode: text("image_selection_mode").notNull().default("prefer_feed"),
  imageSelectionNotes: text("image_selection_notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Waitlist ──────────────────────────────────────────────────────────
export const waitlistSignups = sqliteTable("waitlist_signups", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("landing"), // "landing" | "blog" | "social"
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── API Keys ─────────────────────────────────────────────────────────
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keySuffix: text("key_suffix").notNull(),
  scope: text("scope").notNull().default("all"), // "all" | "profile:{id}"
  permission: text("permission").notNull().default("read"), // "read" | "read_write"
  status: text("status").notNull().default("active"), // "active" | "revoked"
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── AI Model Providers ───────────────────────────────────────────────
export const modelProviderCredentials = sqliteTable("model_provider_credentials", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  provider: text("provider").notNull(), // "openai" | "anthropic" | "gemini" | "xai" | "openrouter" | "custom"
  label: text("label").notNull(),
  baseUrl: text("base_url"),
  protocol: text("protocol").notNull().default("openai_responses"),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  encryptedManagementKey: text("encrypted_management_key"),
  keyPrefix: text("key_prefix").notNull().default(""),
  keySuffix: text("key_suffix").notNull().default(""),
  status: text("status").notNull().default("untested"), // "active" | "untested" | "error" | "revoked"
  statusMessage: text("status_message").notNull().default(""),
  lastTestedAt: integer("last_tested_at", { mode: "timestamp" }),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("model_provider_workspace_idx").on(table.workspaceId),
]);

export const modelCatalog = sqliteTable("model_catalog", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  credentialId: text("credential_id").references(() => modelProviderCredentials.id, {
    onDelete: "cascade",
  }),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  capabilities: text("capabilities", { mode: "json" }).$type<string[]>(),
  contextWindow: integer("context_window"),
  inputPrice: text("input_price"),
  outputPrice: text("output_price"),
  status: text("status").notNull().default("available"), // "available" | "stale" | "manual" | "deprecated"
  source: text("source").notNull().default("discovered"), // "discovered" | "curated" | "manual"
  deprecatedAt: integer("deprecated_at", { mode: "timestamp" }),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("model_catalog_workspace_model_unique").on(
    table.workspaceId,
    table.provider,
    table.modelId
  ),
  index("model_catalog_workspace_idx").on(table.workspaceId),
]);

export const workspaceModelDefaults = sqliteTable("workspace_model_defaults", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  writingModelCatalogId: text("writing_model_catalog_id").references(() => modelCatalog.id, {
    onDelete: "set null",
  }),
  replyModelCatalogId: text("reply_model_catalog_id").references(() => modelCatalog.id, {
    onDelete: "set null",
  }),
  agentModelCatalogId: text("agent_model_catalog_id").references(() => modelCatalog.id, {
    onDelete: "set null",
  }),
  fastModelCatalogId: text("fast_model_catalog_id").references(() => modelCatalog.id, {
    onDelete: "set null",
  }),
  imageModelCatalogId: text("image_model_catalog_id").references(() => modelCatalog.id, {
    onDelete: "set null",
  }),
  embeddingModelCatalogId: text("embedding_model_catalog_id").references(() => modelCatalog.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Notification Preferences ─────────────────────────────────────────
export const notificationPreferences = sqliteTable("notification_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  postFailures: integer("post_failures", { mode: "boolean" }).notNull().default(true),
  accountDisconnects: integer("account_disconnects", { mode: "boolean" }).notNull().default(true),
  paymentAlerts: integer("payment_alerts", { mode: "boolean" }).notNull().default(true),
  usageAlerts: integer("usage_alerts", { mode: "boolean" }).notNull().default(true),
  marketingEmails: integer("marketing_emails", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  userWorkspaceUnique: uniqueIndex("notification_prefs_user_workspace_idx").on(table.userId, table.workspaceId),
}));

// ── User UI Preferences ──────────────────────────────────────────────
export const userUiPreferences = sqliteTable("user_ui_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  productMode: text("product_mode").notNull().default("saas"),
  agentDockMode: text("agent_dock_mode").notNull().default("right-widget"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  userWorkspaceUnique: uniqueIndex("user_ui_prefs_user_workspace_idx").on(table.userId, table.workspaceId),
}));

// ── Activity + Email Delivery ────────────────────────────────────────
export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  subject: text("subject").notNull(),
  body: text("body").notNull().default(""),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  correlationId: text("correlation_id"),
  dedupeKey: text("dedupe_key"),
  source: text("source").notNull().default("app"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("activity_log_workspace_dedupe_idx")
    .on(table.workspaceId, table.dedupeKey)
    .where(sql`dedupe_key IS NOT NULL AND dedupe_key != ''`),
]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  activityLogId: text("activity_log_id").references(() => activityLog.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("in_app"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  severity: text("severity").notNull().default("info"),
  status: text("status").notNull().default("unread"),
  readAt: integer("read_at", { mode: "timestamp" }),
  dismissedAt: integer("dismissed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: text("id").primaryKey(),
  notificationId: text("notification_id").references(() => notifications.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("email"),
  provider: text("provider").notNull().default("resend"),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  externalMessageId: text("external_message_id"),
  idempotencyKey: text("idempotency_key"),
  errorClassification: text("error_classification"),
  errorMessage: text("error_message"),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  failedAt: integer("failed_at", { mode: "timestamp" }),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("notification_deliveries_idempotency_idx")
    .on(table.idempotencyKey)
    .where(sql`idempotency_key IS NOT NULL AND idempotency_key != ''`),
]);

export const emailEvents = sqliteTable("email_events", {
  id: text("id").primaryKey(),
  deliveryId: text("delivery_id").references(() => notificationDeliveries.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  eventType: text("event_type").notNull(),
  recipientEmail: text("recipient_email"),
  externalMessageId: text("external_message_id"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("email_events_provider_event_idx").on(table.provider, table.providerEventId),
]);

export const emailSuppressions = sqliteTable("email_suppressions", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  scope: text("scope").notNull().default("marketing"),
  reason: text("reason").notNull(),
  provider: text("provider"),
  eventId: text("event_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("email_suppressions_email_scope_idx").on(table.email, table.scope),
]);

export const leadMagnetDownloads = sqliteTable("lead_magnet_downloads", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  leadMagnetKey: text("lead_magnet_key").notNull(),
  source: text("source").notNull().default("landing"),
  marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Blog Automation ─────────────────────────────────────────────────
export const blogAutomationPosts = sqliteTable("blog_automation_posts", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  category: text("category").notNull().default("Automation"),
  status: text("status").notNull().default("draft"), // "generating" | "draft" | "needs_review" | "approved" | "published" | "failed" | "archived"
  reviewStatus: text("review_status").notNull().default("needs_review"),
  publishStatus: text("publish_status").notNull().default("idle"),
  directAnswer: text("direct_answer").notNull().default(""),
  thesis: text("thesis").notNull().default(""),
  contentMarkdown: text("content_markdown").notNull().default(""),
  heroImageUrl: text("hero_image_url"),
  heroImageAlt: text("hero_image_alt"),
  sources: text("sources", { mode: "json" }).$type<Array<{ title: string; url: string; publisher?: string }>>(),
  frameworkChecks: text("framework_checks", { mode: "json" }).$type<Record<string, unknown>>(),
  validationStatus: text("validation_status").notNull().default("warn"),
  validationScore: integer("validation_score").notNull().default(0),
  targetWords: integer("target_words").notNull().default(2000),
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
  generatedAt: integer("generated_at", { mode: "timestamp" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  mediumArticleId: text("medium_article_id"),
  mediumUrl: text("medium_url"),
  externalDraftPath: text("external_draft_path"),
  lastError: text("last_error"),
  createdByEmail: text("created_by_email"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const blogAutomationRuns = sqliteTable("blog_automation_runs", {
  id: text("id").primaryKey(),
  postId: text("post_id").references(() => blogAutomationPosts.id, { onDelete: "set null" }),
  trigger: text("trigger").notNull(), // "manual" | "daily" | "publish"
  phase: text("phase").notNull(), // "generate" | "validate" | "publish"
  status: text("status").notNull().default("running"),
  input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
  output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  durationMs: integer("duration_ms"),
});

// ── Drip Queue ──────────────────────────────────────────────────────
export const dripQueue = sqliteTable("drip_queue", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  emailKey: text("email_key").notNull(), // "welcome_1" | "welcome_2_connect" | "welcome_3_first_post"
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("drip_queue_user_email_key_idx").on(table.userId, table.emailKey),
]);

// ── Usage Events ─────────────────────────────────────────────────────
export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  platformId: text("platform_id").references(() => platforms.id),
  eventType: text("event_type").notNull(), // "post_published" | "reply_sent" | "comment_sent" | "dm_sent" | "upload" | "api_call" | "schedule_run"
  metadata: text("metadata"), // JSON blob
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Types ─────────────────────────────────────────────────────────────
export type PipelineStep = {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: string;
};
