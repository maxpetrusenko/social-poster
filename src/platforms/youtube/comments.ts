import type { PaginatedResult, PlatformComment, PlatformComments } from "../_shared/types";

const API_BASE = "https://www.googleapis.com/youtube/v3";

export function createComments(): PlatformComments {
  return {
    async getComments(accessToken, postId, cursor, limit = 50) {
      const url = new URL(`${API_BASE}/commentThreads`);
      url.searchParams.set("part", "snippet");
      url.searchParams.set("videoId", postId);
      url.searchParams.set("maxResults", String(Math.min(limit, 100)));
      url.searchParams.set("textFormat", "plainText");
      if (cursor) url.searchParams.set("pageToken", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const items = readArray(body, "items").map((item) => {
        const snippet = readRecord(readRecord(item, "snippet"), "topLevelComment");
        const comment = readRecord(snippet, "snippet");
        const authorChannel = readRecord(comment, "authorChannelId");
        return {
          id: stringValue(snippet.id),
          postId,
          authorId: stringValue(authorChannel.value) || stringValue(comment.authorChannelUrl),
          authorName: optionalString(comment.authorDisplayName),
          text: stringValue(comment.textOriginal) || stringValue(comment.textDisplay),
          createdAt: stringValue(comment.publishedAt),
          likeCount: numberValue(comment.likeCount),
          replyCount: numberValue(readRecord(item, "snippet").totalReplyCount),
          extra: { raw: item },
        } satisfies PlatformComment;
      });

      return {
        data: items,
        nextCursor: optionalString(body.nextPageToken),
        hasMore: Boolean(body.nextPageToken),
      } satisfies PaginatedResult<PlatformComment>;
    },

    async postComment(accessToken, postId, text) {
      const url = new URL(`${API_BASE}/commentThreads`);
      url.searchParams.set("part", "snippet");
      const body = await requestJson(accessToken, "POST", url, {
        snippet: {
          videoId: postId,
          topLevelComment: { snippet: { textOriginal: text } },
        },
      });
      return mapInsertedComment(postId, body);
    },

    async replyToComment(accessToken, commentId, text) {
      const url = new URL(`${API_BASE}/comments`);
      url.searchParams.set("part", "snippet");
      const body = await requestJson(accessToken, "POST", url, {
        snippet: { parentId: commentId, textOriginal: text },
      });
      return mapInsertedComment("", body);
    },
  };
}

async function requestJson(
  accessToken: string,
  method: string,
  url: URL,
  json?: unknown
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`YouTube comments API ${response.status}: ${text.slice(0, 240)}`);
  }
  return body as Record<string, unknown>;
}

function mapInsertedComment(postId: string, body: Record<string, unknown>): PlatformComment {
  const snippet = readRecord(body, "snippet");
  const authorChannel = readRecord(snippet, "authorChannelId");
  return {
    id: stringValue(body.id),
    postId,
    authorId: stringValue(authorChannel.value) || stringValue(snippet.authorChannelUrl),
    authorName: optionalString(snippet.authorDisplayName),
    text: stringValue(snippet.textOriginal) || stringValue(snippet.textDisplay),
    createdAt: stringValue(snippet.publishedAt) || new Date().toISOString(),
    likeCount: numberValue(snippet.likeCount),
    parentId: optionalString(snippet.parentId),
    extra: { raw: body },
  };
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

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
