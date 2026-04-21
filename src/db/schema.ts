import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
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
