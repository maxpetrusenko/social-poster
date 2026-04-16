import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { PublishError } from "./errors";
import { SocialProvider, type ProviderCredentials } from "./base";
import type {
  AccountProfile,
  AuthType,
  MediaType,
  OAuthTokens,
  PostType,
  PublishContent,
  PublishResult,
  RateLimitConfig,
} from "./types";

const DEFAULT_PDS_URL = "https://bsky.social";

type BlueskySession = {
  did: string;
  handle?: string;
};

type BlueskyProfile = {
  did?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
  followersCount?: number;
};

type BlueskyCreateRecord = {
  uri?: string;
  cid?: string;
};

export class BlueskyProvider extends SocialProvider {
  platformName = "Bluesky";
  authType: AuthType = "session";
  maxCaptionLength = 300;
  supportedPostTypes: PostType[] = ["text", "image", "video"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "mp4"];
  requiredScopes: string[] = [];

  private pdsUrl: string;

  constructor(credentials: ProviderCredentials = {}) {
    super(credentials);
    this.pdsUrl = normalizeBaseUrl(
      credentials.pdsUrl ?? credentials.pds_url ?? DEFAULT_PDS_URL
    );
  }

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 5000,
      requestsPerDay: 35000,
      publishPerDay: 100,
    };
  }

  getAuthUrl(): string {
    throw new Error("Bluesky uses handle + app password session auth.");
  }

  async exchangeCode(): Promise<OAuthTokens> {
    throw new Error("Bluesky uses createSession(handle, appPassword).");
  }

  async createSession(handle: string, appPassword: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${this.pdsUrl}/xrpc/com.atproto.server.createSession`,
      {
        json: {
          identifier: handle,
          password: appPassword,
        },
      }
    );

    const accessJwt = stringField(body, "accessJwt");
    const refreshJwt = stringField(body, "refreshJwt");
    return {
      accessToken: accessJwt,
      refreshToken: refreshJwt,
      tokenType: "Bearer",
      raw: body,
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${this.pdsUrl}/xrpc/com.atproto.server.refreshSession`,
      { accessToken: refreshToken }
    );

    return {
      accessToken: stringField(body, "accessJwt"),
      refreshToken: stringField(body, "refreshJwt"),
      tokenType: "Bearer",
      raw: body,
    };
  }

  async revokeToken(accessToken: string): Promise<boolean> {
    try {
      await this.request("POST", `${this.pdsUrl}/xrpc/com.atproto.server.deleteSession`, {
        accessToken,
      });
      return true;
    } catch {
      return false;
    }
  }

  async resolveHandle(handle: string): Promise<string> {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${DEFAULT_PDS_URL}/xrpc/com.atproto.identity.resolveHandle`,
      { params: { handle } }
    );
    return stringField(body, "did");
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const session = await this.getSession(accessToken);
    const profile = await this.requestJson<BlueskyProfile>(
      "GET",
      `${this.pdsUrl}/xrpc/app.bsky.actor.getProfile`,
      {
        accessToken,
        params: { actor: session.did },
      }
    );

    return {
      platformId: profile.did ?? session.did,
      name: profile.displayName ?? profile.handle ?? session.handle ?? session.did,
      handle: profile.handle ?? session.handle,
      avatarUrl: profile.avatar,
      followerCount: profile.followersCount ?? 0,
      extra: profile as Record<string, unknown>,
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const text = content.text ?? "";
    const length = countGraphemes(text);
    if (length > this.maxCaptionLength) {
      throw new PublishError(
        `Post text exceeds ${this.maxCaptionLength} graphemes (got ${length})`,
        { platform: this.platformName }
      );
    }

    const session = await this.getSession(accessToken);
    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
    };

    const facets = await this.parseFacets(text);
    if (facets.length > 0) record.facets = facets;

    const embed = await this.buildEmbed(accessToken, content);
    if (embed) record.embed = embed;

    const result = await this.requestJson<BlueskyCreateRecord>(
      "POST",
      `${this.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
      {
        accessToken,
        json: {
          repo: session.did,
          collection: "app.bsky.feed.post",
          record,
        },
      }
    );

    const uri = result.uri ?? "";
    const rkey = uri.split("/").at(-1);
    const url =
      rkey && session.handle
        ? `https://bsky.app/profile/${session.handle}/post/${rkey}`
        : undefined;

    return {
      platformPostId: uri || result.cid || "",
      url,
      extra: result as Record<string, unknown>,
    };
  }

  private async getSession(accessToken: string): Promise<BlueskySession> {
    return this.requestJson<BlueskySession>(
      "GET",
      `${this.pdsUrl}/xrpc/com.atproto.server.getSession`,
      { accessToken }
    );
  }

  private async parseFacets(text: string) {
    const facets: Array<Record<string, unknown>> = [];

    for (const match of text.matchAll(/https?:\/\/[^\s)\]>]+/g)) {
      facets.push({
        index: byteRange(text, match.index ?? 0, match[0].length),
        features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
      });
    }

    for (const match of text.matchAll(/(?<!\w)@([\w.-]+(?:\.[\w.-]+)+)/g)) {
      try {
        facets.push({
          index: byteRange(text, match.index ?? 0, match[0].length),
          features: [
            {
              $type: "app.bsky.richtext.facet#mention",
              did: await this.resolveHandle(match[1]),
            },
          ],
        });
      } catch {
        // Unresolvable mentions can still be published as plain text.
      }
    }

    for (const match of text.matchAll(/(?<!\w)#(\w+)/g)) {
      facets.push({
        index: byteRange(text, match.index ?? 0, match[0].length),
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: match[1] }],
      });
    }

    return facets.sort((a, b) => {
      const left = a.index as { byteStart: number };
      const right = b.index as { byteStart: number };
      return left.byteStart - right.byteStart;
    });
  }

  private async buildEmbed(accessToken: string, content: PublishContent) {
    const media = await collectMedia(content);
    if (media.length === 0) return null;

    const first = media[0];
    if (content.postType === "video" || first.mimeType.startsWith("video/")) {
      return {
        $type: "app.bsky.embed.video",
        video: await this.uploadBlob(accessToken, first),
      };
    }

    const altText = stringExtra(content.extra, "altText", "alt_text") ?? "";
    const images = [];
    for (const item of media.slice(0, 4)) {
      images.push({
        alt: altText,
        image: await this.uploadBlob(accessToken, item),
      });
    }

    return {
      $type: "app.bsky.embed.images",
      images,
    };
  }

  private async uploadBlob(accessToken: string, media: MediaItem) {
    const response = await this.request(
      "POST",
      `${this.pdsUrl}/xrpc/com.atproto.repo.uploadBlob`,
      {
        accessToken,
        headers: { "Content-Type": media.mimeType },
        body: media.bytes,
      }
    );
    const body = (await response.json()) as Record<string, unknown>;
    return body.blob ?? body;
  }
}

type MediaItem = {
  bytes: BodyInit;
  mimeType: string;
  filename: string;
};

async function collectMedia(content: PublishContent): Promise<MediaItem[]> {
  const items: MediaItem[] = [];

  for (const file of content.mediaFiles ?? []) {
    const bytes = await readFile(file);
    items.push({
      bytes: new Blob([new Uint8Array(bytes)], { type: mimeFromName(file) }),
      mimeType: mimeFromName(file),
      filename: basename(file),
    });
  }

  for (const url of content.mediaUrls ?? []) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new PublishError(`Failed to fetch Bluesky media URL: ${response.status}`, {
        platform: "Bluesky",
      });
    }
    const bytes = await response.arrayBuffer();
    const mimeType = response.headers.get("Content-Type") ?? mimeFromName(url);
    items.push({
      bytes: new Blob([bytes], { type: mimeType }),
      mimeType,
      filename: basename(new URL(url).pathname) || "media",
    });
  }

  return items;
}

function byteRange(text: string, charStart: number, charLength: number) {
  const encoder = new TextEncoder();
  return {
    byteStart: encoder.encode(text.slice(0, charStart)).length,
    byteEnd: encoder.encode(text.slice(0, charStart + charLength)).length,
  };
}

function countGraphemes(text: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)
    ).length;
  }
  return Array.from(text).length;
}

function stringField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value) {
    throw new PublishError(`Bluesky response missing ${key}`, {
      platform: "Bluesky",
      rawResponse: body,
    });
  }
  return value;
}

function stringExtra(
  extra: Record<string, unknown> | undefined,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = extra?.[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function mimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}
