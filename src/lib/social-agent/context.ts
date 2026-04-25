import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  pipelineRuns,
  platforms,
  posts,
  postTargets,
  profiles,
  replyCandidates,
  replyEvents,
  rssSettings,
  rssSources,
  schedules,
} from "@/db/schema";
import {
  CONNECTION_PLATFORM_DEFINITIONS,
  getConnectionPlatformDefinition,
} from "@/lib/connection-catalog";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { getPlatformCapabilities } from "@/lib/platform-capabilities";
import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";
import { isReplyLanguageAllowed, normalizeReplyLanguage } from "@/lib/replies/language";
import {
  canManageOrganization,
  canManageWorkspace,
  getTenantContext,
} from "@/lib/tenancy";

const REVIEW_REPLY_STATUSES = new Set(["new", "analyzed", "drafted"]);

type SocialAgentPlatformType = PlatformType | "x";

type SafePlatform = {
  type: SocialAgentPlatformType;
  label: string;
  name: string;
  handle: string | null;
  provider: string;
  enabled: boolean;
  connectionState: "active" | "disabled";
  capabilities: ReturnType<typeof getPlatformCapabilities>;
  warnings: string[];
};

type SafeReplyCandidate = {
  platformType: SocialAgentPlatformType;
  platformLabel: string;
  platformHandle: string | null;
  lane: "review" | "ready" | "posted" | "skipped";
  status: string;
  author: string;
  authorName: string | null;
  text: string;
  hook: string | null;
  selectedDraft: string | null;
  draftCount: number;
  score: number;
  riskLevel: string;
  tags: string[];
  tweetUrl: string;
  replyUrl: string | null;
  profileLabel: string | null;
  updatedAt: string | null;
};

export type SocialAgentContext = {
  workspace: { name: string; organizationName: string };
  access: {
    orgRole: string;
    workspaceRole: string;
    canManageOrganization: boolean;
    canManageCurrentWorkspace: boolean;
    canInviteMembers: boolean;
  };
  summary: {
    enabledPlatformCount: number;
    disabledPlatformCount: number;
    missingPlatformCount: number;
    profileCount: number;
    scheduleCount: number;
    postCount: number;
    reviewReplyCount: number;
    readyReplyCount: number;
    postedReplyCount: number;
    replyEventCount: number;
    pipelineRunCount: number;
    rssSourceCount: number;
  };
  profiles: Array<{ name: string }>;
  platforms: SafePlatform[];
  missingPlatforms: Array<{ type: PlatformType; label: string; reason: string }>;
  replies: {
    review: SafeReplyCandidate[];
    ready: SafeReplyCandidate[];
    postedRecent: SafeReplyCandidate[];
    skippedRecent: SafeReplyCandidate[];
    recentEvents: Array<{ platformLabel: string; author: string; lane: string; status: string; replyText: string | null; error: string | null; createdAt: string | null }>;
  };
  recentPosts: Array<{
    title: string | null;
    status: string;
    contentType: string;
    scheduledAt: string | null;
    targets: Array<{ platformLabel: string; status: string; publishedUrl: string | null; error: string | null }>;
  }>;
  schedules: Array<{
    name: string;
    enabled: boolean;
    cron: string;
    jobType: string;
    targetPlatforms: string[];
  }>;
  pipelineRuns: Array<{
    status: string;
    trigger: string;
    scheduleName: string | null;
    postTitle: string | null;
    error: string | null;
    durationMs: number | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  rss: {
    sources: Array<{ name: string; url: string; enabled: boolean; weight: number }>;
    settings: {
      candidateWindowHours: number;
      candidatePoolSize: number;
      minimumScore: number;
      imageSelectionMode: string;
      keywordBoostTerms: string[];
    } | null;
  };
  availableActions: Array<{
    label: string;
    endpoint: string;
    method: string;
    guardrail: string;
  }>;
};

export async function loadSocialAgentContext(
  options: { replyLanguage?: string | null } = {}
): Promise<SocialAgentContext | null> {
  const tenant = await getTenantContext();
  if (!tenant) return null;

  const workspaceId = tenant.currentWorkspace.id;
  const canManageOrg = canManageOrganization(tenant);
  const canManageCurrentWorkspace = canManageWorkspace(tenant, workspaceId);
  const replyLanguage = normalizeReplyLanguage(options.replyLanguage);
  const [
    profileRows,
    platformRows,
    postRows,
    scheduleRows,
    replyCandidateRows,
    replyEventRows,
    pipelineRunRows,
    rssSourceRows,
    rssSettingRows,
  ] = await Promise.all([
    db
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.workspaceId, workspaceId)),
    db.select().from(platforms).where(eq(platforms.workspaceId, workspaceId)),
    db
      .select({
        id: posts.id,
        title: posts.title,
        status: posts.status,
        contentType: posts.contentType,
        scheduledAt: posts.scheduledAt,
      })
      .from(posts)
      .where(eq(posts.workspaceId, workspaceId))
      .orderBy(desc(posts.updatedAt))
      .limit(12),
    db
      .select({
        id: schedules.id,
        name: schedules.name,
        enabled: schedules.enabled,
        cron: schedules.cron,
        jobType: schedules.jobType,
        targetPlatformIds: schedules.targetPlatformIds,
      })
      .from(schedules)
      .where(eq(schedules.workspaceId, workspaceId)),
    db
      .select()
      .from(replyCandidates)
      .where(eq(replyCandidates.workspaceId, workspaceId))
      .orderBy(desc(replyCandidates.updatedAt))
      .limit(30),
    db
      .select()
      .from(replyEvents)
      .where(eq(replyEvents.workspaceId, workspaceId))
      .orderBy(desc(replyEvents.createdAt))
      .limit(12),
    db
      .select({
        status: pipelineRuns.status,
        trigger: pipelineRuns.trigger,
        scheduleId: pipelineRuns.scheduleId,
        postId: pipelineRuns.postId,
        error: pipelineRuns.error,
        durationMs: pipelineRuns.durationMs,
        startedAt: pipelineRuns.startedAt,
        completedAt: pipelineRuns.completedAt,
      })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.workspaceId, workspaceId))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(8),
    db
      .select({
        name: rssSources.name,
        url: rssSources.url,
        enabled: rssSources.enabled,
        weight: rssSources.weight,
      })
      .from(rssSources)
      .where(eq(rssSources.workspaceId, workspaceId))
      .orderBy(desc(rssSources.enabled), desc(rssSources.weight)),
    db.select().from(rssSettings).where(eq(rssSettings.workspaceId, workspaceId)).limit(1),
  ]);

  const safePlatforms = platformRows.map((platform) => {
    const type = platform.type as SocialAgentPlatformType;
    const definition =
      type === "x" ? null : getConnectionPlatformDefinition(type as PlatformType);
    const meta = getPlatformMeta(type);
    const capabilities = getPlatformCapabilities(platform);
    const warnings = [];
    if (!platform.enabled) warnings.push("Connected but disabled.");
    if (!capabilities.canSchedule) warnings.push("Scheduling not advertised.");

    return {
      type,
      label: definition?.label ?? meta.label,
      name: platform.name,
      handle: platform.handle,
      provider: platform.provider,
      enabled: platform.enabled,
      connectionState: platform.enabled ? "active" : "disabled",
      capabilities,
      warnings,
    } satisfies SafePlatform;
  });

  const platformById = new Map(
    platformRows.map((platform) => [
      platform.id,
      {
        type: platform.type as SocialAgentPlatformType,
        label:
          (platform.type === "x"
            ? null
            : getConnectionPlatformDefinition(platform.type as PlatformType)?.label) ??
          getPlatformMeta(platform.type as PlatformType).label,
        handle: platform.handle,
      },
    ])
  );
  const postById = new Map(postRows.map((post) => [post.id, post]));
  const scheduleById = new Map(scheduleRows.map((schedule) => [schedule.id, schedule]));
  const postIds = postRows.map((post) => post.id);
  const targetRows = postIds.length
    ? await db
        .select({
          postId: postTargets.postId,
          platformId: postTargets.platformId,
          status: postTargets.status,
          publishedUrl: postTargets.publishedUrl,
          error: postTargets.error,
        })
        .from(postTargets)
        .where(inArray(postTargets.postId, postIds))
    : [];
  const targetsByPostId = groupBy(targetRows, (target) => target.postId);
  const connectedTypes = new Set(
    safePlatforms.map((platform) =>
      platform.type === "x" ? "twitter" : platform.type
    )
  );
  const missingPlatforms = CONNECTION_PLATFORM_DEFINITIONS.filter(
    (definition) =>
      PLATFORM_TYPES.includes(definition.type) && !connectedTypes.has(definition.type)
  ).map((definition) => ({
    type: definition.type,
    label: definition.label,
    reason: "No connected account in this workspace.",
  }));
  const safeReplies = replyCandidateRows
    .filter((row) => {
      const sourceType = readString(row.metadata, "sourceType");
      return (
        (!sourceType || sourceType === "original_post") &&
        isReplyLanguageAllowed(row.tweetText, replyLanguage)
      );
    })
    .map((row) => mapReplyCandidate(row, platformById));
  const reviewReplies = safeReplies.filter((reply) => reply.lane === "review");
  const readyReplies = safeReplies.filter((reply) => reply.lane === "ready");
  const postedReplies = safeReplies.filter((reply) => reply.lane === "posted");
  const skippedReplies = safeReplies.filter((reply) => reply.lane === "skipped");
  const rssSetting = rssSettingRows[0] ?? null;

  return {
    workspace: {
      name: tenant.currentWorkspace.name,
      organizationName: tenant.organization.name,
    },
    access: {
      orgRole: tenant.orgMembership.orgRole,
      workspaceRole: tenant.currentWorkspaceMembership.workspaceRole,
      canManageOrganization: canManageOrg,
      canManageCurrentWorkspace,
      canInviteMembers: canManageOrg,
    },
    summary: {
      enabledPlatformCount: safePlatforms.filter((platform) => platform.enabled).length,
      disabledPlatformCount: safePlatforms.filter((platform) => !platform.enabled).length,
      missingPlatformCount: missingPlatforms.length,
      profileCount: profileRows.length,
      scheduleCount: scheduleRows.length,
      postCount: postRows.length,
      reviewReplyCount: reviewReplies.length,
      readyReplyCount: readyReplies.length,
      postedReplyCount: postedReplies.length,
      replyEventCount: replyEventRows.length,
      pipelineRunCount: pipelineRunRows.length,
      rssSourceCount: rssSourceRows.length,
    },
    profiles: profileRows,
    platforms: safePlatforms,
    missingPlatforms,
    replies: {
      review: reviewReplies,
      ready: readyReplies,
      postedRecent: postedReplies.slice(0, 8),
      skippedRecent: skippedReplies.slice(0, 8),
      recentEvents: replyEventRows.map((event) => {
        const platform = event.platformId ? platformById.get(event.platformId) : null;
        return {
          platformLabel: platform?.label ?? "Unknown platform",
          author: event.authorHandle.startsWith("@")
            ? event.authorHandle
            : `@${event.authorHandle}`,
          lane: event.lane,
          status: event.status,
          replyText: event.replyText ? truncateText(event.replyText, 220) : null,
          error: event.error ? truncateText(event.error, 180) : null,
          createdAt: toIso(event.createdAt),
        };
      }),
    },
    recentPosts: postRows.map((post) => ({
      title: post.title,
      status: post.status,
      contentType: post.contentType,
      scheduledAt: toIso(post.scheduledAt),
      targets: (targetsByPostId.get(post.id) ?? []).map((target) => {
        const platform = platformById.get(target.platformId);
        return {
          platformLabel: platform?.label ?? "Unknown platform",
          status: target.status,
          publishedUrl: target.publishedUrl,
          error: target.error ? truncateText(target.error, 180) : null,
        };
      }),
    })),
    schedules: scheduleRows.map((schedule) => ({
      name: schedule.name,
      enabled: schedule.enabled,
      cron: schedule.cron,
      jobType: schedule.jobType,
      targetPlatforms: (schedule.targetPlatformIds ?? []).map(
        (platformId) => platformById.get(platformId)?.label ?? "Unknown platform"
      ),
    })),
    pipelineRuns: pipelineRunRows.map((run) => ({
      status: run.status,
      trigger: run.trigger,
      scheduleName: run.scheduleId ? scheduleById.get(run.scheduleId)?.name ?? null : null,
      postTitle: run.postId ? postById.get(run.postId)?.title ?? null : null,
      error: run.error ? truncateText(run.error, 220) : null,
      durationMs: run.durationMs,
      startedAt: toIso(run.startedAt),
      completedAt: toIso(run.completedAt),
    })),
    rss: {
      sources: rssSourceRows,
      settings: rssSetting
        ? {
            candidateWindowHours: rssSetting.candidateWindowHours,
            candidatePoolSize: rssSetting.candidatePoolSize,
            minimumScore: rssSetting.minimumScore,
            imageSelectionMode: rssSetting.imageSelectionMode,
            keywordBoostTerms: rssSetting.keywordBoostTerms ?? [],
          }
        : null,
    },
    availableActions: [
      {
        label: "Create draft or scheduled post",
        endpoint: "/api/posts",
        method: "POST",
        guardrail: "Requires current session and workspace scoped platform targets.",
      },
      {
        label: "Create recurring post schedule from chat",
        endpoint: "/api/social-agent",
        method: "POST",
        guardrail:
          "Workspace editor can ask for a recurring post with cadence, target platform, copy, and optional uploaded image.",
      },
      {
        label: "Bulk remove RSS sources except one kept source",
        endpoint: "/api/social-agent",
        method: "POST",
        guardrail:
          "Workspace editor can remove RSS feeds when the single source to keep is named or matched.",
      },
      {
        label: "Publish existing post",
        endpoint: "/api/posts/[id]/publish",
        method: "POST",
        guardrail: "Requires a saved post in the current workspace.",
      },
      {
        label: "Load or refresh X reply review queue",
        endpoint: "/api/replies",
        method: "GET or POST",
        guardrail: "Review lane is reply candidates with new, analyzed, or drafted status.",
      },
      {
        label: "Move a reply candidate or post a ready reply",
        endpoint: "/api/replies/[id] and /api/replies/[id]/post",
        method: "POST",
        guardrail: "Use only candidates in the current workspace.",
      },
      {
        label: "Manage social accounts",
        endpoint: "/api/platforms",
        method: "GET or POST",
        guardrail: "Never expose credential values or internal account metadata.",
      },
      {
        label: "Create a support ticket",
        endpoint: "/api/support-tickets or /api/social-agent",
        method: "POST",
        guardrail:
          "Use /support type | topic | explanation | image-url in chat. Valid types: from_user_triage, from_bot, from_github_issue, from_me.",
      },
      ...(canManageOrg
        ? [
            {
              label: "Invite a member to the current workspace",
              endpoint: "/api/social-agent",
              method: "POST",
              guardrail:
                "Use exact command: /invite email@example.com as viewer|client|contributor|editor|manager.",
            },
          ]
        : []),
    ],
  };
}

function mapReplyCandidate(
  row: typeof replyCandidates.$inferSelect,
  platformById: Map<
    string,
    { type: SocialAgentPlatformType; label: string; handle: string | null }
  >
): SafeReplyCandidate {
  const platform = row.platformId ? platformById.get(row.platformId) : null;
  const drafts = Array.isArray(row.drafts) ? row.drafts : [];
  const selectedDraft = drafts[row.selectedDraftIndex] ?? drafts[0] ?? null;

  return {
    platformType: platform?.type ?? "twitter",
    platformLabel: platform?.label ?? "X",
    platformHandle: platform?.handle ?? null,
    lane: getReplyLane(row.status),
    status: row.status,
    author: row.authorHandle.startsWith("@") ? row.authorHandle : `@${row.authorHandle}`,
    authorName: row.authorName,
    text: truncateText(row.tweetText, 260),
    hook: row.hook ? truncateText(row.hook, 180) : null,
    selectedDraft: selectedDraft ? truncateText(selectedDraft, 300) : null,
    draftCount: drafts.length,
    score: row.score,
    riskLevel: row.riskLevel,
    tags: Array.isArray(row.tags) ? row.tags : [],
    tweetUrl: row.tweetUrl,
    replyUrl: row.replyUrl,
    profileLabel: readString(row.metadata, "profileLabel"),
    updatedAt: toIso(row.updatedAt),
  };
}

function getReplyLane(status: string): SafeReplyCandidate["lane"] {
  if (REVIEW_REPLY_STATUSES.has(status)) return "review";
  if (status === "ready") return "ready";
  if (status === "posted") return "posted";
  return "skipped";
}

function groupBy<T, K>(items: T[], keyFor: (item: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  return grouped;
}

function readString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`
    : normalized;
}

function toIso(date: Date | null) {
  return date ? date.toISOString() : null;
}
