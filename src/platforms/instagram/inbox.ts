import { createInbox as createFacebookInbox } from "../facebook/inbox";
import type { PlatformInbox } from "../_shared/types";

export function createInbox(accountId?: string | null): PlatformInbox {
  const base = createFacebookInbox(accountId, "instagram");

  return {
    async getConversations(accessToken, cursor, limit) {
      return base.getConversations(accessToken, cursor, limit);
    },
    async getMessages(accessToken, conversationId, cursor, limit) {
      return base.getMessages(accessToken, conversationId, cursor, limit);
    },
    async sendMessage(accessToken, conversationId, text) {
      return base.sendMessage(accessToken, conversationId, text);
    },
    markRead: base.markRead,
  };
}
