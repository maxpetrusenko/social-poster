import type {
  Conversation,
  DirectMessage,
  PaginatedResult,
  PlatformInbox,
} from "../_shared/types";

const API_BASE = "https://api.x.com/2";

export function createInbox(): PlatformInbox {
  return {
    async getConversations(accessToken, cursor, limit = 25) {
      const url = new URL(`${API_BASE}/dm_conversations`);
      url.searchParams.set("max_results", String(Math.min(limit, 100)));
      url.searchParams.set("dm_event.fields", "id,text,created_at,sender_id");
      url.searchParams.set("expansions", "participant_ids,sender_id");
      url.searchParams.set("user.fields", "id,name,username");
      if (cursor) url.searchParams.set("pagination_token", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const usersById = new Map(
        readArray(readRecord(body, "includes"), "users").map((user) => [
          stringValue(user.id),
          user,
        ])
      );
      const conversations = readArray(body, "data").map((item) => {
        const participantIds = readStringArray(item.participant_ids);
        return {
          id: stringValue(item.dm_conversation_id) || stringValue(item.id),
          participantIds,
          participantNames: participantIds.map((id) => {
            const user = usersById.get(id);
            return stringValue(user?.username) || stringValue(user?.name) || id;
          }),
          lastMessageAt: optionalString(item.created_at),
          extra: { raw: item },
        } satisfies Conversation;
      });

      return {
        data: conversations,
        nextCursor: optionalString(readRecord(body, "meta").next_token),
        hasMore: Boolean(readRecord(body, "meta").next_token),
      } satisfies PaginatedResult<Conversation>;
    },

    async getMessages(accessToken, conversationId, cursor, limit = 25) {
      const url = new URL(`${API_BASE}/dm_conversations/${conversationId}/dm_events`);
      url.searchParams.set("max_results", String(Math.min(limit, 100)));
      url.searchParams.set("dm_event.fields", "id,text,created_at,sender_id");
      if (cursor) url.searchParams.set("pagination_token", cursor);

      const body = await requestJson(accessToken, "GET", url);
      const messages = readArray(body, "data").map((item) => ({
        id: stringValue(item.id) || stringValue(item.event_id),
        conversationId,
        senderId: stringValue(item.sender_id),
        text: stringValue(item.text),
        createdAt: stringValue(item.created_at) || new Date().toISOString(),
        extra: { raw: item },
      }));

      return {
        data: messages,
        nextCursor: optionalString(readRecord(body, "meta").next_token),
        hasMore: Boolean(readRecord(body, "meta").next_token),
      } satisfies PaginatedResult<DirectMessage>;
    },

    async sendMessage(accessToken, conversationId, text) {
      const body = await requestJson(
        accessToken,
        "POST",
        new URL(`${API_BASE}/dm_conversations/${conversationId}/messages`),
        { text }
      );
      const data = readRecord(body, "data");
      return {
        id: stringValue(data.id) || stringValue(data.dm_event_id),
        conversationId,
        senderId: stringValue(data.sender_id) || "me",
        text,
        createdAt: stringValue(data.created_at) || new Date().toISOString(),
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
    throw new Error(`X DM API ${response.status}: ${text.slice(0, 240)}`);
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

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
