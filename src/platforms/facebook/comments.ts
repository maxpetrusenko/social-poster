import type { PaginatedResult, PlatformComment, PlatformComments } from "../_shared/types";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export function createComments(): PlatformComments {
  return {
    async getComments(accessToken, postId, cursor, limit = 50) {
      const url = new URL(`${GRAPH_BASE}/${postId}/comments`);
      url.searchParams.set("fields", "id,from,message,created_time,like_count,comment_count,parent");
      url.searchParams.set("limit", String(Math.min(limit, 100)));
      if (cursor) url.searchParams.set("after", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const comments = readArray(body, "data").map((item) => mapComment(postId, item));
      return {
        data: comments,
        nextCursor: optionalString(readRecord(readRecord(body, "paging"), "cursors").after),
        hasMore: Boolean(readRecord(body, "paging").next),
      } satisfies PaginatedResult<PlatformComment>;
    },

    async postComment(accessToken, postId, text) {
      const body = await requestJson(
        accessToken,
        "POST",
        new URL(`${GRAPH_BASE}/${postId}/comments`),
        { message: text }
      );
      return mapOutgoing(postId, body, text);
    },

    async replyToComment(accessToken, commentId, text) {
      const body = await requestJson(
        accessToken,
        "POST",
        new URL(`${GRAPH_BASE}/${commentId}/comments`),
        { message: text }
      );
      return { ...mapOutgoing("", body, text), parentId: commentId };
    },
  };
}

async function requestJson(
  accessToken: string,
  method: string,
  url: URL,
  json?: Record<string, string>
) {
  if (method === "GET") url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, {
    method,
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json ? JSON.stringify({ ...json, access_token: accessToken }) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Facebook comments API ${response.status}: ${text.slice(0, 240)}`);
  }
  return body as Record<string, unknown>;
}

function mapComment(postId: string, item: Record<string, unknown>): PlatformComment {
  const from = readRecord(item, "from");
  const parent = readRecord(item, "parent");
  return {
    id: stringValue(item.id),
    postId,
    authorId: stringValue(from.id),
    authorName: optionalString(from.name),
    text: stringValue(item.message),
    createdAt: stringValue(item.created_time) || new Date().toISOString(),
    likeCount: numberValue(item.like_count),
    replyCount: numberValue(item.comment_count),
    parentId: optionalString(parent.id),
    extra: { raw: item },
  };
}

function mapOutgoing(
  postId: string,
  body: Record<string, unknown>,
  text: string
): PlatformComment {
  return {
    id: stringValue(body.id),
    postId,
    authorId: "me",
    authorName: "Me",
    text,
    createdAt: new Date().toISOString(),
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
