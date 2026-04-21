import type {
  Conversation,
  DirectMessage,
  PaginatedResult,
  PlatformInbox,
} from "../_shared/types";

type MastodonCredentials = Record<string, string | undefined>;

export function createInbox(credentials: MastodonCredentials): PlatformInbox {
  const instanceUrl = requireInstanceUrl(credentials);

  return {
    async getConversations(accessToken, cursor, limit = 25) {
      const { body, nextCursor } = await listConversations(
        instanceUrl,
        accessToken,
        cursor,
        limit
      );
      const conversations = readArray(body, "data").map((item) => mapConversation(item));

      return {
        data: conversations,
        nextCursor,
        hasMore: Boolean(nextCursor),
      } satisfies PaginatedResult<Conversation>;
    },

    async getMessages(accessToken, conversationId) {
      const decoded = decodeConversationId(conversationId);
      const { body } = await listConversations(instanceUrl, accessToken, undefined, 100);
      const conversation = readArray(body, "data").find(
        (item) => stringValue(item.id) === decoded.conversationId
      );
      const lastStatus = readRecord(conversation, "last_status");
      const messages = lastStatus.id
        ? [mapStatusToMessage(conversationId, lastStatus)]
        : [];

      return {
        data: messages,
        hasMore: false,
      } satisfies PaginatedResult<DirectMessage>;
    },

    async sendMessage(accessToken, conversationId, text) {
      const decoded = decodeConversationId(conversationId);
      if (!decoded.recipientAcct) {
        throw new Error("Mastodon conversation is missing recipient account.");
      }
      const params = new URLSearchParams();
      params.set("status", `@${decoded.recipientAcct.replace(/^@/, "")} ${text}`);
      params.set("visibility", "direct");
      if (decoded.lastStatusId) params.set("in_reply_to_id", decoded.lastStatusId);

      const body = await requestJson(
        accessToken,
        "POST",
        new URL(`${instanceUrl}/api/v1/statuses`),
        params
      );
      return mapStatusToMessage(conversationId, body);
    },
  };
}

async function listConversations(
  instanceUrl: string,
  accessToken: string,
  cursor: string | undefined,
  limit: number
) {
  const url = new URL(`${instanceUrl}/api/v1/conversations`);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  if (cursor) url.searchParams.set("max_id", cursor);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : [];
  if (!response.ok) {
    throw new Error(`Mastodon inbox API ${response.status}: ${text.slice(0, 240)}`);
  }
  return {
    body: { data: Array.isArray(body) ? body : [] },
    nextCursor: parseNextCursor(response.headers.get("link")),
  };
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
    throw new Error(`Mastodon inbox API ${response.status}: ${text.slice(0, 240)}`);
  }
  return json as Record<string, unknown>;
}

function mapConversation(item: Record<string, unknown>): Conversation {
  const accounts = readArray(item, "accounts");
  const lastStatus = readRecord(item, "last_status");
  const firstAccount = accounts[0];
  return {
    id: encodeConversationId(
      stringValue(item.id),
      stringValue(firstAccount?.acct),
      stringValue(lastStatus.id)
    ),
    participantIds: accounts.map((account) => stringValue(account.id)),
    participantNames: accounts.map((account) =>
      stringValue(account.acct) || stringValue(account.display_name)
    ),
    lastMessageAt: optionalString(lastStatus.created_at),
    unreadCount: item.unread === true ? 1 : 0,
    extra: { raw: item },
  };
}

function mapStatusToMessage(
  conversationId: string,
  status: Record<string, unknown>
): DirectMessage {
  const account = readRecord(status, "account");
  return {
    id: stringValue(status.id),
    conversationId,
    senderId: stringValue(account.acct) || stringValue(account.id) || "me",
    text: stripHtml(stringValue(status.content)),
    createdAt: stringValue(status.created_at) || new Date().toISOString(),
    extra: {
      raw: status,
      senderName: stringValue(account.display_name) || stringValue(account.acct),
    },
  };
}

function encodeConversationId(
  conversationId: string,
  recipientAcct: string,
  lastStatusId: string
) {
  return [
    conversationId,
    encodeURIComponent(recipientAcct),
    encodeURIComponent(lastStatusId),
  ].join("|");
}

function decodeConversationId(value: string) {
  const [conversationId, recipientAcct = "", lastStatusId = ""] = value.split("|");
  return {
    conversationId,
    recipientAcct: decodeURIComponent(recipientAcct),
    lastStatusId: decodeURIComponent(lastStatusId),
  };
}

function parseNextCursor(value: string | null) {
  if (!value) return undefined;
  const match = value.match(/[?&]max_id=([^&>]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
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
