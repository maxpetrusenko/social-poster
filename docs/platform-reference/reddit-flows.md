---
title: Reddit API Reference — Platform Depth
summary: Reddit Devvit posting, user actions, and review gate notes for the social-poster restructure.
read_when:
  - You are wiring Reddit posting or subreddit-installed app behavior.
  - You need to know whether Reddit uses Devvit instead of a classic open posting API.
  - You are mapping moderation and custom-post workflows into the connector registry.
---

# Reddit API Reference — Platform Depth

> Reference for `src/platforms/reddit/` implementation
> Last reviewed: 2026-04-17

## Access Model

Reddit's current official developer path is **Devvit**. The platform docs describe read/write Reddit content through the Devvit app model, not through a separate general-purpose public posting API.

## Posting Paths

| Path | What it does | Notes |
|---|---|---|
| `reddit.submitPost` | Submit posts on behalf of the app or user | Requires the Reddit permission in Devvit. |
| `reddit.submitComment` | Submit comments | Same Devvit permissions model. |
| `reddit.submitCustomPost` | Create interactive custom posts | Requires a defined entrypoint in `devvit.json`. |
| `userActions` | User-side post/comment actions | Posts and comments occur on the logged-in user's account. |

## Workflow Shape

```text
devvit app
  -> install to subreddit
  -> review / publish if required
  -> submitPost or submitCustomPost
  -> optional userActions for user-authored actions
```

## Guardrails

- Apps cannot upvote or downvote posts or comments through user actions.
- Apps cannot follow users.
- Interactive posts and NSFW apps require review before publication.
- Private user data is intentionally restricted.

## Social Poster Fit

Reddit should be modeled as a subreddit-installed app platform, not as a generic cross-post API.

## References

- Reddit for Developers: [Reddit API Overview](https://developers.reddit.com/docs/capabilities/server/reddit-api) — current platform overview.
- Reddit for Developers: [User Actions](https://developers.reddit.com/docs/capabilities/server/userActions) — current user action model.
- Reddit for Developers: [Creating a Custom Post](https://developers.reddit.com/docs/capabilities/creating_custom_post) — current custom-post flow.
- Reddit for Developers: [Publish your app](https://developers.reddit.com/docs/get-started/publish) — current review and publish gate.
