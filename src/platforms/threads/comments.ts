import type { PaginatedResult, PlatformComment, PlatformComments } from "../_shared/types";
import { ThreadsProvider } from "../../lib/providers/threads";
import type { ProviderCredentials } from "../_shared/base-platform";

const API_BASE = "https://graph.threads.net/v1.0";

export function createComments(credentials: ProviderCredentials = {}): PlatformComments {
  const provider = new ThreadsProvider(credentials);

  return {
    async getComments(accessToken, postId, cursor, limit = 50) {
      const url = new URL(`${API_BASE}/${postId}/replies`);
      url.searchParams.set("fields", "id,text,username,timestamp,permalink");
      url.searchParams.set("limit", String(Math.min(limit, 100)));
      if (cursor) url.searchParams.set("after", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const comments = readArray(body, "data").map((item) => ({
        id: stringValue(item.id),
        postId,
        authorId: stringValue(item.username),
        authorName: optionalString(item.username),
        text: stringValue(item.text),
        createdAt: stringValue(item.timestamp) || new Date().toISOString(),
        parentId: postId,
        extra: { raw: item, url: optionalString(item.permalink) },
      }));

      return {
        data: comments,
        nextCursor: optionalString(readRecord(readRecord(body, "paging"), "cursors").after),
        hasMore: Boolean(readRecord(body, "paging").next),
      } satisfies PaginatedResult<PlatformComment>;
    },

    async postComment(accessToken, postId, text) {
      const result = await provider.publishPost(accessToken, {
        text,
        postType: "text",
        extra: { reply_to_id: postId },
      });
      return {
        id: result.platformPostId,
        postId,
        authorId: "me",
        authorName: "Me",
        text,
        createdAt: new Date().toISOString(),
        parentId: postId,
        extra: result.extra,
      };
    },

    async replyToComment(accessToken, commentId, text) {
      const result = await provider.publishPost(accessToken, {
        text,
        postType: "text",
        extra: { reply_to_id: commentId },
      });
      return {
        id: result.platformPostId,
        postId: "",
        authorId: "me",
        authorName: "Me",
        text,
        createdAt: new Date().toISOString(),
        parentId: commentId,
        extra: result.extra,
      };
    },
  };
}

async function requestJson(accessToken: string, method: string, url: URL) {
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { method });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Threads replies API ${response.status}: ${text.slice(0, 240)}`);
  }
  return body as Record<string, unknown>;
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
