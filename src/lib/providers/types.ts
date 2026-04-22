export type PostType =
  | "text"
  | "image"
  | "video"
  | "carousel"
  | "story"
  | "reel"
  | "link"
  | "article"
  | "poll"
  | "pin"
  | "short";

export type MediaType =
  | "jpeg"
  | "png"
  | "gif"
  | "mp4"
  | "mov"
  | "webp"
  | "pdf";

export type AuthType = "oauth2" | "session" | "instance_oauth";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  raw?: Record<string, unknown>;
}

export interface AccountProfile {
  platformId: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  followerCount?: number;
  extra?: Record<string, unknown>;
}

export interface PublishContent {
  text: string;
  mediaUrls?: string[];
  mediaFiles?: string[];
  postType?: PostType;
  linkUrl?: string;
  title?: string;
  description?: string;
  firstComment?: string;
  extra?: Record<string, unknown>;
}

export interface PublishResult {
  platformPostId: string;
  url?: string;
  extra?: Record<string, unknown>;
}

export interface DeleteResult {
  deleted: boolean;
  extra?: Record<string, unknown>;
}

export interface RateLimitConfig {
  requestsPerHour: number;
  requestsPerDay: number;
  publishPerDay: number;
  extra?: Record<string, unknown>;
}
