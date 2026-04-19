---
title: Telegram Bot API Reference — Platform Depth
summary: Telegram bot posting, channel delivery, and topic-aware messaging notes for the social-poster restructure.
read_when:
  - You are wiring Telegram publishing through a bot token.
  - You need the current sendMessage and channel/topic constraints.
  - You are deciding whether Telegram should be treated as bot-first or user-first.
---

# Telegram Bot API Reference — Platform Depth

> Reference for `src/platforms/telegram/` implementation
> Last reviewed: 2026-04-17

## Access Model

Telegram is bot-first for automation. The Bot API is the official HTTP interface for posting into chats, groups, and channels.

## Posting Flow

```text
BotFather creates bot
  -> capture bot token
  -> add bot to target channel or group
  -> grant send rights
  -> sendMessage / sendPhoto / sendMediaGroup
  -> use message_thread_id when posting into a topic
```

## What Matters

| Area | Current doc note |
|---|---|
| `sendMessageDraft` | Allowed to all bots in Bot API 9.5. |
| Topics | `message_thread_id` is supported in topic-enabled chats. |
| Broadcast throughput | Free bots can broadcast up to 30 messages/sec; paid broadcasts can raise this. |
| Channels | `chat_id` can be a numeric chat id or `@channelusername`. |

## Guardrails

- Bots do not post as human users.
- Channel or group permissions determine whether the bot can publish.
- Treat `sendMessageDraft` as a chat UX feature, not a replacement for a content workflow unless the product specifically needs it.

## Social Poster Fit

Very good for:

- channel announcements
- scheduled notifications
- bot-managed community updates
- topic-aware group posting

## References

- Telegram Bot API: [Bot API](https://core.telegram.org/bots/api) — current main reference, version 9.6 in the recent changes block.
- Telegram Bots: [Bots: an introduction for developers](https://core.telegram.org/bots) — current platform intro.
- Telegram Bots: [From BotFather to 'Hello World'](https://core.telegram.org/bots/tutorial) — current getting-started guide.
