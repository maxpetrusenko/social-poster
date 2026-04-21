import "server-only";

import { randomUUID } from "node:crypto";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  inboxConversations,
  inboxMessages,
  platforms,
  postTargets,
} from "@/db/schema";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import {
  mergeProviderCredentials,
  readAccessToken,
  readRefreshToken,
} from "@/lib/providers/credentials";
import { normalizeNativePlatform } from "@/lib/providers/platform-key";
import {
  getMentionsForPlatform,
  getTweetAuthor,
  getTweetAuthorName,
  getTweetCreatedAt,
  getTweetText,
  getTweetUrl,
} from "@/lib/replies/bird";
import { getPlatformModule } from "@/platforms/registry";
import {
  getCapabilityForSurface,
  getInboxPlatformGroup,
  getInboxPlatformGroupByType,
  INBOX_PLATFORM_GROUPS,
  type InboxSurface,
} from "./platforms";
import type { PlatformComment, DirectMessage } from "@/platforms/_shared/types";

type PlatformRow = typeof platforms.$inferSelect;
type InboxConversationRow = typeof inboxConversations.$inferSelect;
type InboxMessageRow = typeof inboxMessages.$inferSelect;

export type InboxPlatformSummary = {
  key: string;
  label: string;
  connectedCount: number;
  platformIds: string[];
  capability: "live" | "planned" | "blocked";
  note: string;
};

export type InboxDisplayRow = {
  id: string;
  conversationId: string;
  messageId: string;
  platformKey: string;
  platformLabel: string;
  platformId: string;
  author: string;
  authorAvatarUrl: string | null;
  text: string;
  sourceUrl: string | null;
  receivedAt: string | null;
  status: string;
  direction: string;
  canReply: boolean;
  isUnread: boolean;
};

export type InboxUnreadCounts = Record<InboxSurface, number>;

export type InboxPullResult = {
  pulled: number;
  platformResults: Array<{
    platformId: string;
    platformLabel: string;
    status: "synced" | "skipped" | "failed";
    message: string;
    pulled: number;
  }>;
};

export async function getSocialInboxSurfaceData(
  workspaceId: string,
  surface: InboxSurface
) {
  const connected = await getWorkspacePlatforms(workspaceId);
  const summaries = INBOX_PLATFORM_GROUPS.map((group) => {
    const rows = connected.filter((platform) =>
      group.types.includes(platform.type.toLowerCase())
    );
    return {
      key: group.key,
      label: group.label,
      connectedCount: rows.length,
      platformIds: rows.map((platform) => platform.id),
      capability: getCapabilityForSurface(group, surface),
      note: group.note,
    } satisfies InboxPlatformSummary;
  });

  const rows = await listInboxRows(workspaceId, surface);
  return { platforms: summaries, rows };
}

export async function getInboxUnreadCounts(
  workspaceId: string
): Promise<InboxUnreadCounts> {
  const rows = await db
    .select({
      surface: inboxMessages.surface,
      total: count(),
    })
    .from(inboxMessages)
    .where(
      and(
        eq(inboxMessages.workspaceId, workspaceId),
        eq(inboxMessages.direction, "incoming"),
        isNull(inboxMessages.readAt)
      )
    )
    .groupBy(inboxMessages.surface);

  const counts: InboxUnreadCounts = { replies: 0, comments: 0, dms: 0 };
  for (const row of rows) {
    if (row.surface === "replies" || row.surface === "comments" || row.surface === "dms") {
      counts[row.surface] = row.total;
    }
  }
  return counts;
}

export async function markInboxSurfaceSeen(
  workspaceId: string,
  surface: InboxSurface
) {
  await db
    .update(inboxMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(inboxMessages.workspaceId, workspaceId),
        eq(inboxMessages.surface, surface),
        eq(inboxMessages.direction, "incoming"),
        isNull(inboxMessages.readAt)
      )
    );
}

export async function pullInboxSurface(
  workspaceId: string,
  surface: InboxSurface,
  platformKey: string
): Promise<InboxPullResult> {
  const group = getInboxPlatformGroup(platformKey);
  if (!group) throw new Error("Unknown inbox platform");

  const connected = (await getWorkspacePlatforms(workspaceId)).filter((platform) =>
    group.types.includes(platform.type.toLowerCase())
  );

  const platformResults: InboxPullResult["platformResults"] = [];
  let pulled = 0;

  for (const platform of connected) {
    const label = platform.name || getPlatformMeta(platform.type).label;
    try {
      const result =
        surface === "comments"
          ? await pullCommentsForPlatform(workspaceId, platform)
          : surface === "dms"
            ? await pullDmsForPlatform(workspaceId, platform)
            : { pulled: 0, message: "Replies are handled by the X reply engine." };
      pulled += result.pulled;
      platformResults.push({
        platformId: platform.id,
        platformLabel: label,
        status: result.pulled > 0 ? "synced" : "skipped",
        message: result.message,
        pulled: result.pulled,
      });
    } catch (error) {
      platformResults.push({
        platformId: platform.id,
        platformLabel: label,
        status: "failed",
        message: error instanceof Error ? error.message : "Pull failed",
        pulled: 0,
      });
    }
  }

  if (connected.length === 0) {
    platformResults.push({
      platformId: "",
      platformLabel: group.label,
      status: "skipped",
      message: "No connected account for this platform group.",
      pulled: 0,
    });
  }

  return { pulled, platformResults };
}

export async function sendInboxReply({
  workspaceId,
  conversationId,
  messageId,
  text,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  text: string;
}) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Reply text is required.");

  const conversation = await db.query.inboxConversations.findFirst({
    where: and(
      eq(inboxConversations.id, conversationId),
      eq(inboxConversations.workspaceId, workspaceId)
    ),
  });
  if (!conversation) throw new Error("Conversation not found.");

  const message = await db.query.inboxMessages.findFirst({
    where: and(
      eq(inboxMessages.id, messageId),
      eq(inboxMessages.workspaceId, workspaceId)
    ),
  });
  if (!message) throw new Error("Message not found.");

  const platform = conversation.platformId
    ? await db.query.platforms.findFirst({
        where: eq(platforms.id, conversation.platformId),
      })
    : null;
  if (!platform) throw new Error("Connected platform not found.");

  const accessToken = readStoredAccessToken(platform);
  if (!accessToken) throw new Error("Connected account is missing an access token.");
  const platformModule = getInboxPlatformModule(platform);
  let providerMessageId = `local:${randomUUID()}`;

  if (conversation.surface === "comments") {
    if (!platformModule.comments) throw new Error("This platform cannot reply to comments yet.");
    const external = getExternalCommentId(message, conversation);
    const result = platformModule.comments.replyToComment
      ? await platformModule.comments.replyToComment(accessToken, external, trimmed)
      : await platformModule.comments.postComment(accessToken, conversation.externalThreadId, trimmed);
    providerMessageId = result.id || providerMessageId;
  } else if (conversation.surface === "dms") {
    if (!platformModule.inbox) throw new Error("This platform cannot send DMs yet.");
    const result = await platformModule.inbox.sendMessage(
      accessToken,
      conversation.externalThreadId,
      trimmed
    );
    providerMessageId = result.id || providerMessageId;
  } else {
    throw new Error("Use the X reply board for reply-engine candidates.");
  }

  const now = new Date();
  await db.insert(inboxMessages).values({
    id: randomUUID(),
    conversationId: conversation.id,
    workspaceId,
    platformId: platform.id,
    surface: conversation.surface,
    providerMessageId,
    direction: "outgoing",
    authorHandle: platform.handle || platform.name,
    authorName: platform.name,
    body: trimmed,
    sourceUrl: conversation.externalUrl,
    sentAt: now,
    metadata: { replyToMessageId: message.id },
    createdAt: now,
  }).onConflictDoNothing();

  await db.update(inboxConversations).set({
    status: "waiting_on_them",
    lastMessageAt: now,
    updatedAt: now,
  }).where(eq(inboxConversations.id, conversation.id));
}

async function getWorkspacePlatforms(workspaceId: string) {
  return db
    .select()
    .from(platforms)
    .where(eq(platforms.workspaceId, workspaceId));
}

async function listInboxRows(
  workspaceId: string,
  surface: InboxSurface
): Promise<InboxDisplayRow[]> {
  const rows = await db
    .select({
      message: inboxMessages,
      conversation: inboxConversations,
      platform: platforms,
    })
    .from(inboxMessages)
    .innerJoin(
      inboxConversations,
      eq(inboxMessages.conversationId, inboxConversations.id)
    )
    .innerJoin(platforms, eq(inboxMessages.platformId, platforms.id))
    .where(and(eq(inboxMessages.workspaceId, workspaceId), eq(inboxMessages.surface, surface)))
    .orderBy(desc(inboxMessages.sentAt), desc(inboxMessages.createdAt));

  return rows.map(({ message, conversation, platform }) =>
    toDisplayRow(message, conversation, platform)
  );
}

async function pullCommentsForPlatform(workspaceId: string, platform: PlatformRow) {
  const accessToken = readStoredAccessToken(platform);
  if (isXPlatform(platform) && usesBirdTransport(platform)) {
    return pullXBirdMentionsForPlatform(workspaceId, platform);
  }

  if (!accessToken) {
    return { pulled: 0, message: "No OAuth access token stored for comment pull." };
  }

  if (isXPlatform(platform)) {
    const mentions = await pullXApiMentionsForPlatform(workspaceId, platform, accessToken);
    const postReplies = await pullPostCommentsForPlatform(workspaceId, platform, accessToken);
    return {
      pulled: mentions.pulled + postReplies.pulled,
      message: `${mentions.message} ${postReplies.message}`,
    };
  }

  return pullPostCommentsForPlatform(workspaceId, platform, accessToken);
}

async function pullPostCommentsForPlatform(
  workspaceId: string,
  platform: PlatformRow,
  accessToken: string
) {
  const platformModule = getInboxPlatformModule(platform);
  if (!platformModule.comments) {
    return { pulled: 0, message: "Comment pull is not implemented for this platform yet." };
  }

  const targets = await db
    .select()
    .from(postTargets)
    .where(
      and(
        eq(postTargets.platformId, platform.id),
        eq(postTargets.status, "published")
      )
    );

  let pulled = 0;
  for (const target of targets.filter((item) => resolveExternalPostId(item)).slice(0, 20)) {
    const postId = resolveExternalPostId(target)!;
    const result = await platformModule.comments.getComments(
      accessToken,
      postId,
      undefined,
      50
    );
    for (const comment of result.data) {
      await upsertComment(workspaceId, platform, postId, comment);
      pulled += 1;
    }
  }

  return {
    pulled,
    message: targets.length === 0
      ? "No published posts found for this platform yet."
      : `Pulled comments from ${Math.min(targets.length, 20)} published posts.`,
  };
}

async function pullXBirdMentionsForPlatform(
  workspaceId: string,
  platform: PlatformRow
) {
  const tweets = await getMentionsForPlatform(platform, 50, true);
  let pulled = 0;
  for (const tweet of tweets.slice(0, 50)) {
    const comment = mapBirdMentionToComment(tweet);
    if (!comment) continue;
    await upsertComment(workspaceId, platform, comment.postId, comment);
    pulled += 1;
  }

  return {
    pulled,
    message: `Pulled ${pulled} X mentions via Bird.`,
  };
}

async function pullXApiMentionsForPlatform(
  workspaceId: string,
  platform: PlatformRow,
  accessToken: string
) {
  const accountId = readXAccountId(platform);
  const handle = platform.handle?.replace(/^@/, "");
  const url = accountId
    ? new URL(`https://api.x.com/2/users/${accountId}/mentions`)
    : new URL("https://api.x.com/2/tweets/search/recent");

  if (accountId) {
    url.searchParams.set("max_results", "50");
  } else if (handle) {
    url.searchParams.set("query", `@${handle} -from:${handle}`);
    url.searchParams.set("max_results", "50");
  } else {
    return { pulled: 0, message: "X mentions need accountId or handle on the connection." };
  }

  url.searchParams.set("tweet.fields", "author_id,created_at,conversation_id,public_metrics,text");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "id,name,username,profile_image_url");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    throw new Error(`X mentions API ${response.status}: ${text.slice(0, 240)}`);
  }

  const usersById = new Map(
    readArray(readRecord(body, "includes"), "users").map((user) => [
      stringValue(user.id),
      user,
    ])
  );
  let pulled = 0;
  for (const tweet of readArray(body, "data")) {
    const comment = mapXApiMentionToComment(tweet, usersById);
    if (!comment) continue;
    await upsertComment(workspaceId, platform, comment.postId, comment);
    pulled += 1;
  }

  return {
    pulled,
    message: `Pulled ${pulled} X mentions.`,
  };
}

async function pullDmsForPlatform(workspaceId: string, platform: PlatformRow) {
  const accessToken = readStoredAccessToken(platform);
  if (!accessToken) {
    return { pulled: 0, message: "No OAuth access token stored for DM pull." };
  }
  const platformModule = getInboxPlatformModule(platform);
  if (!platformModule.inbox) {
    return { pulled: 0, message: "DM pull is not implemented for this platform yet." };
  }

  const conversations = await platformModule.inbox.getConversations(accessToken, undefined, 25);
  let pulled = 0;
  for (const conversation of conversations.data) {
    const messages = await platformModule.inbox.getMessages(accessToken, conversation.id, undefined, 25);
    for (const message of messages.data) {
      await upsertDm(workspaceId, platform, conversation.id, message);
      pulled += 1;
    }
  }

  return { pulled, message: `Pulled ${conversations.data.length} DM conversations.` };
}

async function upsertComment(
  workspaceId: string,
  platform: PlatformRow,
  postId: string,
  comment: PlatformComment
) {
  const now = new Date();
  const group = getInboxPlatformGroupByType(platform.type);
  const threadId = comment.parentId || comment.id;
  const conversation = await upsertConversation({
    workspaceId,
    platform,
    surface: "comments",
    externalThreadId: threadId,
    externalUrl: comment.extra?.url as string | undefined,
    subject: `${group?.label || platform.name} comment`,
    lastMessageAt: parseDate(comment.createdAt) ?? now,
    metadata: { postId, parentId: comment.parentId ?? null },
  });

  await db.insert(inboxMessages).values({
    id: randomUUID(),
    conversationId: conversation.id,
    workspaceId,
    platformId: platform.id,
    surface: "comments",
    providerMessageId: comment.id,
    direction: "incoming",
    authorHandle: comment.authorId,
    authorName: comment.authorName,
    body: comment.text,
    sourceUrl: (comment.extra?.url as string | undefined) ?? null,
    sentAt: parseDate(comment.createdAt),
    metadata: {
      postId,
      likeCount: comment.likeCount ?? null,
      replyCount: comment.replyCount ?? null,
      parentId: comment.parentId ?? null,
      authorAvatarUrl: stringOrNull(comment.extra?.authorAvatarUrl),
    },
    createdAt: now,
  }).onConflictDoNothing();
}

async function upsertDm(
  workspaceId: string,
  platform: PlatformRow,
  conversationId: string,
  message: DirectMessage
) {
  const now = new Date();
  const conversation = await upsertConversation({
    workspaceId,
    platform,
    surface: "dms",
    externalThreadId: conversationId,
    externalUrl: null,
    subject: "Direct message",
    lastMessageAt: parseDate(message.createdAt) ?? now,
    metadata: { participantIds: [message.senderId] },
  });

  await db.insert(inboxMessages).values({
    id: randomUUID(),
    conversationId: conversation.id,
    workspaceId,
    platformId: platform.id,
    surface: "dms",
    providerMessageId: message.id,
    direction: "incoming",
    authorHandle: message.senderId,
    authorName: message.senderId,
    body: message.text,
    sourceUrl: null,
    sentAt: parseDate(message.createdAt),
    metadata: {
      ...(message.extra ?? {}),
      authorAvatarUrl: stringOrNull(message.extra?.authorAvatarUrl),
    },
    createdAt: now,
  }).onConflictDoNothing();
}

async function upsertConversation({
  workspaceId,
  platform,
  surface,
  externalThreadId,
  externalUrl,
  subject,
  lastMessageAt,
  metadata,
}: {
  workspaceId: string;
  platform: PlatformRow;
  surface: InboxSurface;
  externalThreadId: string;
  externalUrl: string | null | undefined;
  subject: string;
  lastMessageAt: Date;
  metadata: Record<string, unknown>;
}) {
  const existing = await db.query.inboxConversations.findFirst({
    where: and(
      eq(inboxConversations.workspaceId, workspaceId),
      eq(inboxConversations.platformId, platform.id),
      eq(inboxConversations.surface, surface),
      eq(inboxConversations.externalThreadId, externalThreadId)
    ),
  });

  if (existing) {
    await db.update(inboxConversations).set({
      externalUrl: externalUrl ?? existing.externalUrl,
      subject,
      lastMessageAt,
      metadata,
      updatedAt: new Date(),
    }).where(eq(inboxConversations.id, existing.id));
    return existing;
  }

  const now = new Date();
  const conversation = {
    id: randomUUID(),
    workspaceId,
    platformId: platform.id,
    provider: platform.provider,
    surface,
    externalThreadId,
    externalUrl: externalUrl ?? null,
    subject,
    status: "needs_reply",
    priority: "normal",
    lastMessageAt,
    firstMessageAt: lastMessageAt,
    metadata,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(inboxConversations).values(conversation);
  return conversation;
}

function toDisplayRow(
  message: InboxMessageRow,
  conversation: InboxConversationRow,
  platform: PlatformRow
): InboxDisplayRow {
  const group = getInboxPlatformGroupByType(platform.type);
  return {
    id: message.id,
    conversationId: conversation.id,
    messageId: message.id,
    platformKey: group?.key ?? platform.type,
    platformLabel: group?.label ?? getPlatformMeta(platform.type).label,
    platformId: platform.id,
    author: message.authorName || message.authorHandle || "Unknown",
    authorAvatarUrl: stringOrNull(message.metadata?.authorAvatarUrl),
    text: message.body,
    sourceUrl: message.sourceUrl ?? conversation.externalUrl,
    receivedAt: (message.sentAt ?? message.createdAt)?.toISOString() ?? null,
    status: conversation.status,
    direction: message.direction,
    canReply: message.direction === "incoming",
    isUnread: message.direction === "incoming" && !message.readAt,
  };
}

function readStoredAccessToken(platform: PlatformRow) {
  const token = readAccessToken(platform.config) ?? readRefreshToken(platform.config);
  return token;
}

function getInboxPlatformModule(platform: PlatformRow) {
  const platformKey = normalizeNativePlatform(platform.type);
  return getPlatformModule(
    platformKey,
    mergeProviderCredentials(platformKey, platform.config)
  );
}

function getExternalCommentId(
  message: InboxMessageRow,
  conversation: InboxConversationRow
) {
  const parentId = message.metadata?.parentId;
  if (typeof parentId === "string" && parentId) return parentId;
  return message.providerMessageId || conversation.externalThreadId;
}

function mapBirdMentionToComment(
  tweet: Awaited<ReturnType<typeof getMentionsForPlatform>>[number]
): PlatformComment | null {
  const id = tweet.id || getTweetUrl(tweet).match(/status\/(\d+)/)?.[1];
  if (!id) return null;
  const author = getTweetAuthor(tweet);
  return {
    id,
    postId: id,
    authorId: author,
    authorName: getTweetAuthorName(tweet),
    text: getTweetText(tweet),
    createdAt: getTweetCreatedAt(tweet) || new Date().toISOString(),
    likeCount: tweet.likeCount ?? tweet.favoriteCount ?? tweet.favorite_count,
    replyCount: tweet.replyCount ?? tweet.public_metrics?.reply_count,
    extra: {
      raw: tweet,
      url: getTweetUrl(tweet),
      source: "bird_mentions",
      authorAvatarUrl: getBirdAuthorAvatarUrl(tweet),
    },
  };
}

function mapXApiMentionToComment(
  tweet: Record<string, unknown>,
  usersById: Map<string, Record<string, unknown>>
): PlatformComment | null {
  const id = stringValue(tweet.id);
  if (!id) return null;
  const authorId = stringValue(tweet.author_id);
  const user = usersById.get(authorId);
  const username = optionalString(user?.username);
  const metrics = readRecord(tweet, "public_metrics");
  const authorAvatarUrl = optionalString(user?.profile_image_url);

  return {
    id,
    postId: id,
    authorId,
    authorName: username || optionalString(user?.name),
    text: stringValue(tweet.text),
    createdAt: stringValue(tweet.created_at) || new Date().toISOString(),
    likeCount: numberValue(metrics.like_count),
    replyCount: numberValue(metrics.reply_count),
    extra: {
      raw: tweet,
      url: username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/web/status/${id}`,
      source: "x_mentions",
      authorAvatarUrl,
    },
  };
}

function getBirdAuthorAvatarUrl(tweet: Awaited<ReturnType<typeof getMentionsForPlatform>>[number]) {
  const tweetRecord = tweet as Record<string, unknown>;
  const author = readRecord(tweetRecord, "author");
  return (
    optionalString(author.profileImageUrl) ||
    optionalString(author.profile_image_url) ||
    optionalString(author.avatarUrl) ||
    optionalString(author.avatar_url) ||
    optionalString(readRecord(readRecord(readRecord(readRecord(tweetRecord._raw, "core"), "user_results"), "result"), "legacy").profile_image_url_https) ||
    null
  );
}

function isXPlatform(platform: Pick<PlatformRow, "type">) {
  const type = platform.type.toLowerCase();
  return type === "x" || type === "twitter";
}

function usesBirdTransport(platform: Pick<PlatformRow, "provider" | "config">) {
  const config = platform.config ?? {};
  const authMethod = typeof config.authMethod === "string" ? config.authMethod.toLowerCase() : "";
  return platform.provider === "bird" || authMethod === "bird_cli";
}

function readXAccountId(platform: PlatformRow) {
  const config = platform.config ?? {};
  return (
    platform.accountId ||
    stringOrNull(config.accountId) ||
    stringOrNull(config.userId) ||
    stringOrNull(config.platformId) ||
    stringOrNull(config.twitterUserId) ||
    null
  );
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveExternalPostId(target: typeof postTargets.$inferSelect) {
  if (target.platformPostId) return target.platformPostId;
  if (!target.publishedUrl) return null;
  const url = target.publishedUrl;
  return (
    url.match(/status\/(\d+)/)?.[1] ??
    url.match(/[?&]v=([^&]+)/)?.[1] ??
    url.match(/youtu\.be\/([^/?#]+)/)?.[1] ??
    url.match(/feed\/update\/([^/?#]+)/)?.[1] ??
    url.match(/posts\/([^/?#]+)/)?.[1] ??
    null
  );
}

function readRecord(value: unknown, key?: string): Record<string, unknown> {
  const source = key && value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value;
  return source && typeof source === "object" && !Array.isArray(source)
    ? (source as Record<string, unknown>)
    : {};
}

function readArray(value: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const items = value[key];
  return Array.isArray(items) ? items.map((item) => readRecord(item)) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
