import type { PaginatedResult, PlatformComment, PlatformComments } from "../_shared/types";

const INSTAGRAM_GRAPH = "https://graph.instagram.com/v25.0";

export function createComments(): PlatformComments {
  const base = INSTAGRAM_GRAPH;

  return {
    async getComments(accessToken, postId, cursor, limit = 50) {
      const url = new URL(`${base}/${postId}/comments`);
      url.searchParams.set("fields", "id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}");
      url.searchParams.set("limit", String(Math.min(limit, 100)));
      if (cursor) url.searchParams.set("after", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const comments = readArray(body, "data").flatMap((item) => {
        const top = mapComment(postId, item);
        const replies = readArray(readRecord(item, "replies"), "data").map((reply) => ({
          ...mapComment(postId, reply),
          parentId: top.id,
        }));
        return [top, ...replies];
      });

      return {
        data: comments,
        nextCursor: optionalString(readRecord(readRecord(body, "paging"), "cursors").after),
        hasMore: Boolean(readRecord(body, "paging").next),
      } satisfies PaginatedResult<PlatformComment>;
    },

    async postComment(accessToken, postId, text) {
      const url = new URL(`${base}/${postId}/comments`);
      const body = await requestJson(accessToken, "POST", url, { message: text });
      return {
        id: stringValue(body.id),
        postId,
        authorId: "me",
        authorName: "Me",
        text,
        createdAt: new Date().toISOString(),
        extra: { raw: body },
      };
    },

    async replyToComment(accessToken, commentId, text) {
      const url = new URL(`${base}/${commentId}/replies`);
      const body = await requestJson(accessToken, "POST", url, { message: text });
      return {
        id: stringValue(body.id),
        postId: "",
        authorId: "me",
        authorName: "Me",
        text,
        createdAt: new Date().toISOString(),
        parentId: commentId,
        extra: { raw: body },
      };
    },
  };
}

async function requestJson(
  accessToken: string,
  method: string,
  url: URL,
  json?: Record<string, string>
) {
  if (method === "GET") {
    url.searchParams.set("access_token", accessToken);
  }

  const response = await fetch(url, {
    method,
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json
      ? JSON.stringify({ ...json, access_token: accessToken })
      : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Instagram comments API ${response.status}: ${text.slice(0, 240)}`);
  }
  return body as Record<string, unknown>;
}

function mapComment(postId: string, item: Record<string, unknown>): PlatformComment {
  return {
    id: stringValue(item.id),
    postId,
    authorId: stringValue(item.username) || stringValue(item.from),
    authorName: optionalString(item.username),
    text: stringValue(item.text),
    createdAt: stringValue(item.timestamp) || new Date().toISOString(),
    likeCount: numberValue(item.like_count),
    extra: { raw: item },
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
