import type {
  Conversation,
  DirectMessage,
  PaginatedResult,
  PlatformInbox,
} from "../_shared/types";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export function createInbox(
  pageId?: string | null,
  platform?: "instagram" | "messenger"
): PlatformInbox {
  return {
    async getConversations(accessToken, cursor, limit = 25) {
      const id = pageId || "me";
      const url = new URL(`${GRAPH_BASE}/${id}/conversations`);
      url.searchParams.set("fields", "id,updated_time,participants,messages.limit(1){id,message,from,created_time}");
      url.searchParams.set("limit", String(Math.min(limit, 100)));
      if (platform === "instagram") url.searchParams.set("platform", "instagram");
      if (cursor) url.searchParams.set("after", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const conversations = readArray(body, "data").map((item) => {
        const participants = readArray(readRecord(item, "participants"), "data");
        const externalParticipant = participants.find((participant) => stringValue(participant.id) !== pageId);
        const conversationId = encodeConversationId(
          stringValue(item.id),
          stringValue(externalParticipant?.id)
        );
        return {
          id: conversationId,
          participantIds: participants.map((participant) => stringValue(participant.id)),
          participantNames: participants.map((participant) => stringValue(participant.name)),
          lastMessageAt: optionalString(item.updated_time),
          extra: { raw: item },
        } satisfies Conversation;
      });

      return {
        data: conversations,
        nextCursor: optionalString(readRecord(readRecord(body, "paging"), "cursors").after),
        hasMore: Boolean(readRecord(body, "paging").next),
      } satisfies PaginatedResult<Conversation>;
    },

    async getMessages(accessToken, conversationId, cursor, limit = 25) {
      const { graphConversationId } = decodeConversationId(conversationId);
      const url = new URL(`${GRAPH_BASE}/${graphConversationId}/messages`);
      url.searchParams.set("fields", "id,message,from,created_time");
      url.searchParams.set("limit", String(Math.min(limit, 100)));
      if (cursor) url.searchParams.set("after", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const messages = readArray(body, "data").map((item) => mapMessage(conversationId, item));
      return {
        data: messages,
        nextCursor: optionalString(readRecord(readRecord(body, "paging"), "cursors").after),
        hasMore: Boolean(readRecord(body, "paging").next),
      } satisfies PaginatedResult<DirectMessage>;
    },

    async sendMessage(accessToken, conversationId, text) {
      const { recipientId } = decodeConversationId(conversationId);
      if (!recipientId) throw new Error("Facebook conversation is missing recipient id.");
      const body = await requestJson(accessToken, "POST", new URL(`${GRAPH_BASE}/me/messages`), {
        recipient: { id: recipientId },
        message: { text },
      });
      const messageId = stringValue(body.message_id);
      return {
        id: messageId,
        conversationId,
        senderId: "me",
        text,
        createdAt: new Date().toISOString(),
        extra: { raw: body },
      };
    },
  };
}

async function requestJson(
  accessToken: string,
  method: string,
  url: URL,
  json?: unknown
) {
  if (method === "GET") url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, {
    method,
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json ? JSON.stringify({ ...(json as object), access_token: accessToken }) : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Facebook inbox API ${response.status}: ${text.slice(0, 240)}`);
  }
  return body as Record<string, unknown>;
}

function mapMessage(conversationId: string, item: Record<string, unknown>): DirectMessage {
  const from = readRecord(item, "from");
  return {
    id: stringValue(item.id),
    conversationId,
    senderId: stringValue(from.id),
    text: stringValue(item.message),
    createdAt: stringValue(item.created_time) || new Date().toISOString(),
    extra: { raw: item, senderName: stringValue(from.name) },
  };
}

function encodeConversationId(graphConversationId: string, recipientId: string) {
  return recipientId ? `${graphConversationId}:${recipientId}` : graphConversationId;
}

function decodeConversationId(value: string) {
  const [graphConversationId, recipientId] = value.split(":");
  return { graphConversationId, recipientId };
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
