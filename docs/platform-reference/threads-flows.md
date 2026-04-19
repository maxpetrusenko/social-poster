# Threads API Reference — Platform Depth

> Reference for `src/platforms/threads/` implementation
> Last updated: 2026-04-17

---

## 1. API Overview

Threads API is part of Meta's Graph API ecosystem, accessed via `graph.threads.net`. It provides publishing, reply management, insights, keyword search, and webhooks.

### Base URLs
- `https://graph.threads.net/v1.0/` (primary)
- `https://graph.threads.com/v1.0/` (alternative)

### Access Requirements
- Meta Developer account
- App with Threads API product enabled
- App Review for production access
- No Instagram account linkage required (since September 2025)

---

## 2. OAuth 2.0 Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │ Threads  │
│ Browser  │    │  Backend     │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  Threads        │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Redirect to    │                 │
     │  threads.net/   │                 │
     │  oauth/authorize│                 │
     │<────────────────│                 │
     │                 │                 │
     │  User logs in   │                 │
     │  + authorizes   │                 │
     │─────────────────────────────────>│
     │                 │                 │
     │  Redirect with  │                 │
     │  ?code=AUTH_CODE│                 │
     │<─────────────────────────────────│
     │                 │                 │
     │  Forward code   │                 │
     │────────────────>│                 │
     │                 │                 │
     │                 │  POST /oauth/   │
     │                 │  access_token   │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   user_id}      │
     │                 │<────────────────│
     │                 │                 │
     │                 │  Exchange for   │
     │                 │  long-lived     │
     │                 │  token (60 day) │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   expires_in}   │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token lifecycle:
- Short-lived: ~1 hour
- Long-lived: 60 days
- Refresh: GET /refresh_access_token (must be 24hr+ old)
- Scopes are comma-separated (Meta convention)
```

### Authorization URL
```
GET https://threads.net/oauth/authorize
  ?client_id={APP_ID}
  &redirect_uri={REDIRECT_URI}
  &scope={COMMA_SEPARATED_SCOPES}
  &response_type=code
  &state={CSRF_TOKEN}
```

### Token Exchange
```
POST https://graph.threads.net/oauth/access_token
  client_id={APP_ID}
  &client_secret={APP_SECRET}
  &grant_type=authorization_code
  &redirect_uri={REDIRECT_URI}
  &code={AUTH_CODE}
```

### Long-Lived Token Exchange
```
GET https://graph.threads.net/access_token
  ?grant_type=th_exchange_token
  &client_secret={APP_SECRET}
  &access_token={SHORT_LIVED_TOKEN}
```

---

## 3. Scopes & Permissions

| Scope | Description | Required For |
|---|---|---|
| `threads_basic` | Profile info, own media list | Always (base scope) |
| `threads_content_publish` | Create and delete posts | Posting |
| `threads_manage_replies` | Read/manage replies, hide/unhide | Reply management |
| `threads_manage_insights` | Account and media insights | Analytics |
| `threads_read_replies` | Read replies on posts | Read-only reply access |

---

## 4. API Capabilities Matrix

### 4A. Content Publishing

**Container-based publish flow (same as Instagram):**

```
Step 1: Create container
  POST /{USER_ID}/threads
  → Returns container_id

Step 2: Publish container
  POST /{USER_ID}/threads_publish
  ?creation_id={CONTAINER_ID}
  → Returns published thread_id

Step 3 (optional): Check status
  GET /{CONTAINER_ID}?fields=status,error_message
  → FINISHED | IN_PROGRESS | ERROR
```

**Supported content types:**

| Type | media_type | Key Parameters |
|---|---|---|
| Text only | `TEXT` | `text` |
| Single image | `IMAGE` | `image_url`, `text` |
| Single video | `VIDEO` | `video_url`, `text` |
| Carousel | `CAROUSEL` | `children` (up to 20 items), `text` |
| Quote post | `TEXT` | `text`, `quoted_post_id` |
| Repost | — | `POST /{USER_ID}/repost?media_id={ID}` |
| Poll | — | Via post creation with poll parameters |

**Text post:**
```json
POST /{USER_ID}/threads
{
  "media_type": "TEXT",
  "text": "Post text with #hashtags and @mentions"
}
```

**Image post:**
```json
POST /{USER_ID}/threads
{
  "media_type": "IMAGE",
  "image_url": "https://example.com/photo.jpg",
  "text": "Caption",
  "alt_text": "Image description for accessibility"
}
```

**Carousel post:**
```
1. Create child containers:
   POST /{USER_ID}/threads?media_type=IMAGE&image_url=URL1&is_carousel_item=true
   POST /{USER_ID}/threads?media_type=VIDEO&video_url=URL2&is_carousel_item=true

2. Create carousel container:
   POST /{USER_ID}/threads?media_type=CAROUSEL&children=id1,id2&text=caption

3. Publish:
   POST /{USER_ID}/threads_publish?creation_id=carousel_id
```

**Post options:**
- `reply_control`: `everyone` | `accounts_you_follow` | `mentioned_only`
- `link_attachment`: URL to attach
- `spoiler`: boolean (hide content behind spoiler)
- `allowlisted_country_codes`: geo-gate to specific countries
- Up to 5 links per post

### 4B. Reply Management

| Endpoint | Method | Description |
|---|---|---|
| `GET /{MEDIA_ID}/replies` | GET | List direct replies |
| `GET /{MEDIA_ID}/conversation` | GET | Full conversation thread |
| `POST /{USER_ID}/threads` | POST | Create reply (`reply_to_id` param) |
| `PUT /{REPLY_ID}` | PUT | Hide/unhide reply |
| `GET /{USER_ID}/reply_audience` | GET | Pending reply approvals |

**Reply fields:**
```
id, text, timestamp, media_type, media_url, username,
permalink, is_reply, is_reply_owned_by_me, has_replies,
root_post, replied_to, hide_status
```

### 4C. Search & Discovery

| Endpoint | Method | Description |
|---|---|---|
| `GET /{USER_ID}/threads_keyword_search` | GET | Search public posts by keyword |
| `GET /{USER_ID}/threads_topic_search` | GET | Search by topic tag |
| `GET /threads_public_profile` | GET | Public profile lookup (100+ followers) |

**Keyword search:**
```
GET /{USER_ID}/threads_keyword_search
  ?q=search+term
  &media_type=TEXT|IMAGE|VIDEO
  &since=2026-04-01
  &until=2026-04-17
```

### 4D. Insights (Analytics)

**Media-level metrics:**

| Metric | Description |
|---|---|
| `views` | Display count |
| `likes` | Like count |
| `replies` | Reply count |
| `reposts` | Repost count |
| `quotes` | Quote count |
| `shares` | Share count |

```
GET /{MEDIA_ID}/insights?metric=views,likes,replies,reposts,quotes,shares
```

**Account-level metrics:**

| Metric | Description | Period |
|---|---|---|
| `views` | Profile views (time series) | since/until |
| `likes` | Total likes received | since/until |
| `replies` | Total replies received | since/until |
| `reposts` | Total reposts | since/until |
| `quotes` | Total quotes | since/until |
| `clicks` | Link clicks with URLs | since/until |
| `followers_count` | Total followers | No date range |
| `follower_demographics` | Country, city, age, gender | Requires 100+ followers |

```
GET /{USER_ID}/threads_insights
  ?metric=views,likes,replies,followers_count
  &since=1712991600
  &until=1713164400
```

### 4E. Webhooks

| Event | Description |
|---|---|
| `publish` | Post published |
| `delete` | Post deleted |
| `reply` | Reply received |
| `mention` | @mention in post/reply |

Webhook payloads include `is_verified` and `profile_picture_url` fields.

### 4F. Cross-Platform

- **Share to Instagram Stories**: Cross-share Threads post to linked IG account
- **Fediverse sharing**: Eligible posts can be shared to ActivityPub network
- **oEmbed**: Embed Threads posts (no auth required since March 2026)

---

## 5. Rate Limits

| Category | Limit | Window |
|---|---|---|
| **API calls (general)** | 200 calls/user/hour | 1 hour |
| **Publishing** | 250 posts/24 hours | Rolling 24hr |
| **Carousel items** | 20 per carousel | Per post |
| **Media containers** | — | Subject to general limit |
| **Keyword search** | Included in general limit | — |
| **Insights** | Included in general limit | — |

---

## 6. Current State vs What's Possible

| Capability | Current (`threads.ts`) | API Supports | Gap |
|---|---|---|---|
| **Text posting** | Yes | Yes + spoilers, geo-gating | Missing spoilers, geo |
| **Image posting** | Yes | Yes + alt text | Missing alt text |
| **Video posting** | Yes | Yes | Implemented |
| **Carousel** | Yes | Up to 20 items (image + video mix) | May need update for 20-item limit |
| **Quote posts** | Not implemented | `quoted_post_id` param | Full gap |
| **Reposts** | Not implemented | `POST /{id}/repost` | Full gap |
| **Polls** | Not implemented | Supported via API | Full gap |
| **Reply management** | Not implemented | List, create, hide/unhide, approve | Full gap |
| **Search** | Not implemented | Keyword + topic + media type filter | Full gap |
| **Insights** | Scopes requested | Media + account metrics | Implementation gap |
| **Webhooks** | Not implemented | publish, delete, reply, mention | Full gap |
| **Cross-share to IG** | Not implemented | Share as IG Story | Full gap |

---

## 7. Implementation Priority

### Phase 1: Enhance Publishing (Low effort, medium value)
- Add alt text support for images
- Add quote post support
- Add repost functionality
- Add spoiler and geo-gating options
- Estimate: 1-2 days

### Phase 2: Reply Management (Medium effort, high value)
- List replies on posts
- Create replies
- Hide/unhide replies
- Reply approval queue
- Full conversation threads
- Estimate: 2-3 days

### Phase 3: Analytics (Low effort, high value)
- Media-level insights (views, likes, replies, reposts)
- Account-level insights (followers, demographics)
- Already have `threads_manage_insights` scope
- Estimate: 1-2 days

### Phase 4: Search & Discovery (Medium effort, medium value)
- Keyword search with filters
- Topic tag search
- Public profile lookup
- Estimate: 1-2 days

### Phase 5: Webhooks (Medium effort, high value)
- Subscribe to publish, reply, mention events
- Process incoming webhook payloads
- Estimate: 2 days

---

## 8. Key Constraints & Gotchas

1. **Container model is async** — Same as Instagram. Poll `status` until `FINISHED`.
2. **20-item carousel** — Much larger than Instagram's 10-item limit.
3. **500 char limit** — `maxCaptionLength` in our provider matches API limit.
4. **60-day tokens** — Same refresh pattern as Instagram. Must be 24hr+ old to refresh.
5. **100+ followers for demographics** — `follower_demographics` metric requires minimum follower count.
6. **Insights date minimum** — Cannot query before April 13, 2024 (Unix: 1712991600).
7. **Link limit** — Maximum 5 links per post (enforced since Dec 2025).
8. **GIFs via GIPHY only** — Tenor support sunset March 2026. Must use GIPHY.
9. **Reply control** — Can set `everyone`, `accounts_you_follow`, or `mentioned_only` per post.
10. **No DMs** — Threads has no direct messaging API (conversations are public replies only).
