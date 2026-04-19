---
title: Discord API Reference — Platform Depth
summary: Discord bot, webhook, and channel-posting notes for the social-poster restructure.
read_when:
  - You are wiring Discord channel posting or notifications.
  - You need the current bot versus webhook choice.
  - You are deciding how Discord fits into the connector registry.
---

# Discord API Reference — Platform Depth

> Reference for `src/platforms/discord/` implementation
> Last reviewed: 2026-04-17

## Access Model

Discord gives you two practical write paths:

| Path | Best for | Notes |
|---|---|---|
| Bot | Interactive or stateful integrations | Uses a bot token, permissions, and gateway or REST. |
| Incoming webhook | One-way publishing | Push a message into a channel with no bot connection required. |

## Posting Flow

```text
create app
  -> add bot or webhook
  -> grant channel permissions
  -> post message into a guild text channel or DM
  -> optionally reply into a thread
```

## Guardrails

- Bot tokens are app credentials, not user impersonation.
- Channel permissions matter; `SEND_MESSAGES_IN_THREADS` is distinct from regular message sending.
- Use `allowed_mentions` and sanitization when user-generated content is posted.
- Webhooks are the cleanest one-way fit for notifications.

## Social Poster Fit

Good fit:

- alerting
- community notifications
- channel updates
- thread replies by a bot

Weak fit:

- pretending to post as a human user
- app designs that assume one global posting permission

## References

- Discord Docs: [Discord Developer Platform](https://docs.discord.com/) — current developer home.
- Discord Docs: [OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions) — current auth and permission model.
- Discord Docs: [Message Resource](https://docs.discord.com/developers/resources/message) — current create-message reference.
- Discord Docs: [Webhooks](https://docs.discord.com/developers/platform/webhooks) — current webhook reference.
- Discord Docs: [Permissions](https://docs.discord.com/developers/topics/permissions) — current permission model.
