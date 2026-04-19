---
title: Google Business Profile API Reference — Platform Depth
summary: Google Business Profile posts, location updates, and OAuth notes for the social-poster restructure.
read_when:
  - You are wiring Google Business Profile post publishing or location management.
  - You need the current OAuth and location-scoped API shape.
  - You need to know whether product posts are supported.
---

# Google Business Profile API Reference — Platform Depth

> Reference for `src/platforms/google-business/` implementation
> Last reviewed: 2026-04-17

## Access Model

Google Business Profile APIs let businesses manage location data, posts, reviews, questions, and notifications.

## Posting Flow

```text
Google OAuth
  -> pick account
  -> pick location
  -> POST localPosts
  -> PATCH or DELETE later if needed
```

## Post Types

| Type | Notes |
|---|---|
| Event | Includes start and end dates and times. |
| Call to Action | Supports BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL. |
| Offer | Supports coupon code, redemption URL, and terms. |

## Constraints

- Product posts cannot be created via the API page used here.
- Posts are tied to business locations, not personal accounts.
- The docs point to Pub/Sub notifications for location updates and Google Updates.

## Guardrails

- Treat this as a location-management connector, not a generic social network connector.
- Location selection is part of the core UX.
- If you need business info change review, the update flow is separate from post creation.

## References

- Google for Developers: [Create Posts on Google](https://developers.google.com/my-business/content/posts-data) — last updated 2025-08-28 UTC.
- Google for Developers: [Implement OAuth with Business Profile APIs](https://developers.google.com/my-business/content/implement-oauth) — current OAuth setup guide.
- Google for Developers: [Manage Google Updates](https://developers.google.com/my-business/content/accept-or-reject-updates) — current updates/review guide.
- Google for Developers: [Google Business Profile APIs home](https://developers.google.com/my-business) — current product overview.
