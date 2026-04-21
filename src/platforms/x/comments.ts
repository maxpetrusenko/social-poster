import type { PaginatedResult, PlatformComment, PlatformComments } from "../_shared/types";

const API_BASE = "https://api.x.com/2";

export function createComments(handle?: string | null): PlatformComments {
  return {
    async getComments(accessToken, postId, cursor, limit = 50) {
      const url = new URL(`${API_BASE}/tweets/search/recent`);
      const accountHandle = handle?.replace(/^@/, "");
      url.searchParams.set(
        "query",
        accountHandle ? `conversation_id:${postId} -from:${accountHandle}` : `conversation_id:${postId}`
      );
      url.searchParams.set("max_results", String(Math.max(10, Math.min(limit, 100))));
      url.searchParams.set("tweet.fields", "author_id,created_at,conversation_id,public_metrics,text");
      url.searchParams.set("expansions", "author_id");
      url.searchParams.set("user.fields", "id,name,username");
      if (cursor) url.searchParams.set("next_token", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const usersById = new Map(
        readArray(readRecord(body, "includes"), "users").map((user) => [
          stringValue(user.id),
          user,
        ])
      );
      const comments = readArray(body, "data")
        .filter((tweet) => stringValue(tweet.id) !== postId)
        .map((tweet) => mapTweetComment(postId, tweet, usersById));

      return {
        data: comments,
        nextCursor: optionalString(readRecord(body, "meta").next_token),
        hasMore: Boolean(readRecord(body, "meta").next_token),
      } satisfies PaginatedResult<PlatformComment>;
    },

    async postComment(accessToken, postId, text) {
      return createTweetReply(accessToken, postId, text);
    },

    async replyToComment(accessToken, commentId, text) {
      return createTweetReply(accessToken, commentId, text);
    },
  };
}

async function createTweetReply(
  accessToken: string,
  tweetId: string,
  text: string
): Promise<PlatformComment> {
  const body = await requestJson(accessToken, "POST", new URL(`${API_BASE}/tweets`), {
    text,
    reply: { in_reply_to_tweet_id: tweetId },
  });
  const data = readRecord(body, "data");
  return {
    id: stringValue(data.id),
    postId: tweetId,
    authorId: "me",
    authorName: "Me",
    text: stringValue(data.text) || text,
    createdAt: new Date().toISOString(),
    parentId: tweetId,
    extra: { raw: body },
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
    throw new Error(`X comments API ${response.status}: ${text.slice(0, 240)}`);
  }
  return body as Record<string, unknown>;
}

function mapTweetComment(
  postId: string,
  tweet: Record<string, unknown>,
  usersById: Map<string, Record<string, unknown>>
): PlatformComment {
  const authorId = stringValue(tweet.author_id);
  const user = usersById.get(authorId);
  const metrics = readRecord(tweet, "public_metrics");
  return {
    id: stringValue(tweet.id),
    postId,
    authorId,
    authorName: optionalString(user?.username) || optionalString(user?.name),
    text: stringValue(tweet.text),
    createdAt: stringValue(tweet.created_at) || new Date().toISOString(),
    likeCount: numberValue(metrics.like_count),
    replyCount: numberValue(metrics.reply_count),
    parentId: postId,
    extra: {
      raw: tweet,
      url: user?.username && tweet.id
        ? `https://x.com/${user.username}/status/${tweet.id}`
        : null,
    },
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
