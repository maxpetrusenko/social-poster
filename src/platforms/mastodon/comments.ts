import type { PaginatedResult, PlatformComment, PlatformComments } from "../_shared/types";

type MastodonCredentials = Record<string, string | undefined>;

export function createComments(credentials: MastodonCredentials): PlatformComments {
  const instanceUrl = requireInstanceUrl(credentials);

  return {
    async getComments(accessToken, postId) {
      const body = await requestJson(
        accessToken,
        "GET",
        new URL(`${instanceUrl}/api/v1/statuses/${encodeURIComponent(postId)}/context`)
      );
      const comments = readArray(body, "descendants").map((status) =>
        mapStatusToComment(postId, status)
      );

      return {
        data: comments,
        hasMore: false,
      } satisfies PaginatedResult<PlatformComment>;
    },

    async postComment(accessToken, postId, text) {
      return createStatusReply(instanceUrl, accessToken, postId, text);
    },

    async replyToComment(accessToken, commentId, text) {
      return createStatusReply(instanceUrl, accessToken, commentId, text);
    },
  };
}

async function createStatusReply(
  instanceUrl: string,
  accessToken: string,
  statusId: string,
  text: string
): Promise<PlatformComment> {
  const params = new URLSearchParams();
  params.set("status", text);
  params.set("in_reply_to_id", statusId);
  params.set("visibility", "public");

  const body = await requestJson(
    accessToken,
    "POST",
    new URL(`${instanceUrl}/api/v1/statuses`),
    params
  );
  return mapStatusToComment(statusId, body, statusId);
}

async function requestJson(
  accessToken: string,
  method: string,
  url: URL,
  body?: URLSearchParams
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Mastodon comments API ${response.status}: ${text.slice(0, 240)}`);
  }
  return json as Record<string, unknown>;
}

function mapStatusToComment(
  postId: string,
  status: Record<string, unknown>,
  parentId?: string
): PlatformComment {
  const account = readRecord(status, "account");
  return {
    id: stringValue(status.id),
    postId,
    authorId: stringValue(account.id) || stringValue(account.acct),
    authorName: optionalString(account.acct) || optionalString(account.display_name),
    text: stripHtml(stringValue(status.content)),
    createdAt: stringValue(status.created_at) || new Date().toISOString(),
    likeCount: numberValue(status.favourites_count),
    replyCount: numberValue(status.replies_count),
    parentId: parentId ?? optionalString(status.in_reply_to_id) ?? postId,
    extra: {
      raw: status,
      url: optionalString(status.url) ?? optionalString(status.uri),
    },
  };
}

function requireInstanceUrl(credentials: MastodonCredentials) {
  const value = credentials.instanceUrl ?? credentials.instance_url;
  if (!value) throw new Error("Mastodon missing instanceUrl credential.");
  return value.replace(/\/+$/, "");
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
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
