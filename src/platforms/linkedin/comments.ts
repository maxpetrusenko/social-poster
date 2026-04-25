import type { PaginatedResult, PlatformComment, PlatformComments } from "../_shared/types";

const API_BASE = "https://api.linkedin.com";
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION?.trim() || "202604";
const LINKEDIN_HEADERS = {
  "LinkedIn-Version": LINKEDIN_API_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
};

export function createComments(actor?: string): PlatformComments {
  return {
    async getComments(accessToken, postId, cursor, limit = 50) {
      const url = new URL(`${API_BASE}/rest/socialActions/${encodeURIComponent(postId)}/comments`);
      url.searchParams.set("count", String(Math.min(limit, 100)));
      if (cursor) url.searchParams.set("start", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const items = readArray(body, "elements").map((item) => mapComment(postId, item));
      return {
        data: items,
        nextCursor: readPagingStart(body),
        hasMore: Boolean(readPagingStart(body)),
      } satisfies PaginatedResult<PlatformComment>;
    },

    async postComment(accessToken, postId, text) {
      const url = new URL(`${API_BASE}/rest/socialActions/${encodeURIComponent(postId)}/comments`);
      const body = await requestJson(accessToken, "POST", url, {
        actor: actor || "urn:li:person:me",
        object: postId,
        message: { text },
      });
      return mapComment(postId, body);
    },

    async replyToComment(accessToken, commentId, text) {
      const url = new URL(`${API_BASE}/rest/socialActions/${encodeURIComponent(commentId)}/comments`);
      const body = await requestJson(accessToken, "POST", url, {
        actor: actor || "urn:li:person:me",
        message: { text },
      });
      return mapComment("", body);
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
      ...LINKEDIN_HEADERS,
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`LinkedIn comments API ${response.status}: ${text.slice(0, 240)}`);
  }
  return body as Record<string, unknown>;
}

function mapComment(postId: string, item: Record<string, unknown>): PlatformComment {
  const message = readRecord(item, "message");
  const created = readRecord(item, "created");
  const likes = readRecord(item, "likesSummary");
  return {
    id: stringValue(item.commentUrn) || stringValue(item.id),
    postId: stringValue(item.object) || postId,
    authorId: stringValue(item.actor),
    authorName: stringValue(item.actor),
    text: stringValue(message.text),
    createdAt: dateFromMs(created.time),
    likeCount: numberValue(likes.totalLikes),
    parentId: optionalString(item.parentComment),
    extra: { raw: item },
  };
}

function readPagingStart(body: Record<string, unknown>) {
  const paging = readRecord(body, "paging");
  const links = readArray(paging, "links");
  const next = links.find((link) => link.rel === "next");
  return optionalString(next?.href);
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

function dateFromMs(value: unknown) {
  return typeof value === "number" ? new Date(value).toISOString() : new Date().toISOString();
}
