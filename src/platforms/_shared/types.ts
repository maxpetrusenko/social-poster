/**
 * Extended platform module types for the new per-platform architecture.
 *
 * These types extend the original SocialProvider interface to support
 * analytics, DMs, comments, engagement, and webhooks beyond basic posting.
 */

import type {
  AccountProfile,
  OAuthTokens,
  PublishContent,
  PublishResult,
  PostType,
  MediaType,
  AuthType,
  RateLimitConfig,
} from "../../lib/providers/types";

// ---------------------------------------------------------------------------
// Core enums & identifiers
// ---------------------------------------------------------------------------

export type PlatformCapability =
  | "posting"
  | "analytics"
  | "inbox"
  | "comments"
  | "engagement"
  | "webhooks";

// ---------------------------------------------------------------------------
// Shared result / pagination types
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface MetricValue {
  name: string;
  value: number;
  previousValue?: number;
}

// ---------------------------------------------------------------------------
// Auth capability
// ---------------------------------------------------------------------------

export interface PlatformAuth {
  authType: AuthType;
  requiredScopes: string[];

  getAuthUrl(
    redirectUri: string,
    state: string,
    codeVerifier?: string
  ): string;

  exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokens>;

  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  getProfile(accessToken: string): Promise<AccountProfile>;

  revokeToken?(accessToken: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Posting capability
// ---------------------------------------------------------------------------

export interface PlatformPost {
  id: string;
  platformPostId: string;
  text?: string;
  mediaUrls?: string[];
  postType?: PostType;
  url?: string;
  createdAt?: string;
  extra?: Record<string, unknown>;
}

export interface PlatformPosting {
  supportedPostTypes: PostType[];
  supportedMediaTypes: MediaType[];
  maxCaptionLength: number;

  createPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult>;

  deletePost?(accessToken: string, postId: string): Promise<void>;

  getPost?(accessToken: string, postId: string): Promise<PlatformPost>;

  listPosts?(
    accessToken: string,
    cursor?: string,
    limit?: number
  ): Promise<PaginatedResult<PlatformPost>>;
}

// ---------------------------------------------------------------------------
// Analytics capability
// ---------------------------------------------------------------------------

export interface PostMetrics {
  postId: string;
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  saves?: number;
  videoViews?: number;
  engagementRate?: number;
  extra?: Record<string, unknown>;
}

export interface AccountMetrics {
  followers: number;
  following?: number;
  totalPosts?: number;
  impressions?: number;
  reach?: number;
  engagementRate?: number;
  extra?: Record<string, unknown>;
}

export interface TimelinePoint {
  date: string;
  metrics: MetricValue[];
}

export interface BestTimeSlot {
  dayOfWeek: number; // 0=Sun, 6=Sat
  hour: number; // 0-23
  score: number;
}

export interface PlatformAnalytics {
  getPostMetrics(
    accessToken: string,
    postId: string
  ): Promise<PostMetrics>;

  getAccountMetrics(accessToken: string): Promise<AccountMetrics>;

  getTimelineMetrics?(
    accessToken: string,
    range: TimeRange,
    granularity?: "day" | "week" | "month"
  ): Promise<TimelinePoint[]>;

  getBestTimes?(accessToken: string): Promise<BestTimeSlot[]>;
}

// ---------------------------------------------------------------------------
// Inbox / DM capability
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string;
  participantIds: string[];
  participantNames?: string[];
  lastMessageAt?: string;
  unreadCount?: number;
  extra?: Record<string, unknown>;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  extra?: Record<string, unknown>;
}

export interface PlatformInbox {
  getConversations(
    accessToken: string,
    cursor?: string,
    limit?: number
  ): Promise<PaginatedResult<Conversation>>;

  getMessages(
    accessToken: string,
    conversationId: string,
    cursor?: string,
    limit?: number
  ): Promise<PaginatedResult<DirectMessage>>;

  sendMessage(
    accessToken: string,
    conversationId: string,
    text: string
  ): Promise<DirectMessage>;

  markRead?(
    accessToken: string,
    conversationId: string
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Comments capability
// ---------------------------------------------------------------------------

export interface PlatformComment {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string;
  text: string;
  createdAt: string;
  likeCount?: number;
  replyCount?: number;
  parentId?: string;
  extra?: Record<string, unknown>;
}

export interface PlatformComments {
  getComments(
    accessToken: string,
    postId: string,
    cursor?: string,
    limit?: number
  ): Promise<PaginatedResult<PlatformComment>>;

  postComment(
    accessToken: string,
    postId: string,
    text: string
  ): Promise<PlatformComment>;

  replyToComment?(
    accessToken: string,
    commentId: string,
    text: string
  ): Promise<PlatformComment>;

  deleteComment?(
    accessToken: string,
    commentId: string
  ): Promise<void>;

  likeComment?(
    accessToken: string,
    commentId: string
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Engagement capability (like, repost, bookmark)
// ---------------------------------------------------------------------------

export interface PlatformEngagement {
  like(accessToken: string, postId: string): Promise<void>;
  unlike(accessToken: string, postId: string): Promise<void>;
  repost?(accessToken: string, postId: string): Promise<void>;
  unrepost?(accessToken: string, postId: string): Promise<void>;
  bookmark?(accessToken: string, postId: string): Promise<void>;
  unbookmark?(accessToken: string, postId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Webhooks capability
// ---------------------------------------------------------------------------

export interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt?: string;
  extra?: Record<string, unknown>;
}

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface PlatformWebhooks {
  registerWebhook(
    accessToken: string,
    url: string,
    events: string[]
  ): Promise<WebhookRegistration>;

  deleteWebhook(
    accessToken: string,
    webhookId: string
  ): Promise<void>;

  listWebhooks(
    accessToken: string
  ): Promise<WebhookRegistration[]>;

  handleEvent(
    headers: Record<string, string>,
    body: unknown
  ): WebhookEvent | null;
}

// ---------------------------------------------------------------------------
// PlatformModule — the top-level contract for a platform
// ---------------------------------------------------------------------------

export interface PlatformModule {
  id: string;
  name: string;
  capabilities: PlatformCapability[];
  rateLimits: RateLimitConfig;

  auth: PlatformAuth;
  posting?: PlatformPosting;
  analytics?: PlatformAnalytics;
  inbox?: PlatformInbox;
  comments?: PlatformComments;
  engagement?: PlatformEngagement;
  webhooks?: PlatformWebhooks;
}

// Re-export base types so platform implementations can import from one place
export type {
  AccountProfile,
  OAuthTokens,
  PublishContent,
  PublishResult,
  PostType,
  MediaType,
  AuthType,
  RateLimitConfig,
};
