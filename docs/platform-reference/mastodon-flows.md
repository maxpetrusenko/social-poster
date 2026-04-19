# Mastodon API Reference — Platform Depth

> Reference for `src/platforms/mastodon/` implementation
> Last updated: 2026-04-17

---

## 1. API Overview

Mastodon provides a REST API for interacting with any Mastodon instance. Each instance is independent with its own domain, rules, and user base. The API is standardized across instances.

### Base URL Pattern
- `https://{instance_domain}/api/v1/` (most endpoints)
- `https://{instance_domain}/api/v2/` (newer endpoints)
- `https://{instance_domain}/oauth/` (auth endpoints)

### Access Model
- **Instance-based OAuth 2.0** — Must register app per instance
- **No central authority** — Each instance manages its own auth
- **Open source** — API is well-documented and consistent

---

## 2. OAuth 2.0 Flow (Instance-Based)

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │ Mastodon │
│ Browser  │    │  Backend     │    │ Instance │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Enter instance │                 │
     │  URL            │                 │
     │────────────────>│                 │
     │                 │                 │
     │                 │  POST /api/v1/  │
     │                 │  apps           │
     │                 │  {client_name,  │
     │                 │   redirect_uris,│
     │                 │   scopes}       │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {client_id,    │
     │                 │   client_secret}│
     │                 │<────────────────│
     │                 │                 │
     │  Redirect to    │                 │
     │  {instance}/    │                 │
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
     │                 │  token          │
     │                 │  {code, client_ │
     │                 │   id, secret}   │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   token_type,   │
     │                 │   scope}        │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token details:
- access_token: no expiry (persists until revoked)
- No refresh token needed
- Must register app separately per instance
- Store: instance_url + client_id + client_secret + access_token
```

### App Registration (per instance)
```
POST https://{instance}/api/v1/apps
{
  "client_name": "Social Poster",
  "redirect_uris": "https://our-app.com/callback/mastodon",
  "scopes": "read write push",
  "website": "https://our-app.com"
}
→ { "client_id": "...", "client_secret": "..." }
```

### Authorization URL
```
GET https://{instance}/oauth/authorize
  ?client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &scope=read+write+push
  &state={CSRF_TOKEN}
```

---

## 3. Scopes & Permissions

### High-Level Scopes

| Scope | Description |
|---|---|
| `read` | Read all data (includes all read:* sub-scopes) |
| `write` | Write all data (includes all write:* sub-scopes) |
| `push` | Web Push API subscriptions |
| `profile` | Minimal profile access only (since v4.3.0) |

### Granular Read Scopes

| Scope | Description |
|---|---|
| `read:accounts` | Account info |
| `read:blocks` | Block list |
| `read:bookmarks` | Bookmarks |
| `read:favourites` | Favourites |
| `read:filters` | Content filters |
| `read:follows` | Following list |
| `read:lists` | Lists |
| `read:mutes` | Mute list |
| `read:notifications` | Notifications |
| `read:search` | Search |
| `read:statuses` | Read posts |

### Granular Write Scopes

| Scope | Description |
|---|---|
| `write:accounts` | Update profile |
| `write:blocks` | Block/unblock |
| `write:bookmarks` | Bookmark/unbookmark |
| `write:conversations` | Manage conversations |
| `write:favourites` | Favourite/unfavourite |
| `write:filters` | Manage filters |
| `write:follows` | Follow/unfollow |
| `write:lists` | Manage lists |
| `write:media` | Upload media |
| `write:mutes` | Mute/unmute |
| `write:notifications` | Dismiss notifications |
| `write:reports` | File reports |
| `write:statuses` | Create/delete posts |

---

## 4. API Capabilities Matrix

### 4A. Statuses (Posts)

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/v1/statuses` | POST | Create post |
| `GET /api/v1/statuses/{id}` | GET | Read post |
| `PUT /api/v1/statuses/{id}` | PUT | Edit post |
| `DELETE /api/v1/statuses/{id}` | DELETE | Delete post |
| `POST /api/v1/statuses/{id}/reblog` | POST | Boost (repost) |
| `POST /api/v1/statuses/{id}/unreblog` | POST | Unboost |
| `POST /api/v1/statuses/{id}/favourite` | POST | Favourite (like) |
| `POST /api/v1/statuses/{id}/unfavourite` | POST | Unfavourite |
| `POST /api/v1/statuses/{id}/bookmark` | POST | Bookmark |
| `POST /api/v1/statuses/{id}/unbookmark` | POST | Unbookmark |
| `POST /api/v1/statuses/{id}/pin` | POST | Pin to profile |
| `POST /api/v1/statuses/{id}/unpin` | POST | Unpin |
| `POST /api/v1/statuses/{id}/mute` | POST | Mute thread |
| `GET /api/v1/statuses/{id}/context` | GET | Thread context (ancestors + descendants) |
| `GET /api/v1/statuses/{id}/reblogged_by` | GET | Who boosted |
| `GET /api/v1/statuses/{id}/favourited_by` | GET | Who favourited |

**Create post:**
```json
POST /api/v1/statuses
{
  "status": "Post text with @mentions and #hashtags",
  "media_ids": ["media_id_1", "media_id_2"],
  "poll": {
    "options": ["Option 1", "Option 2", "Option 3"],
    "expires_in": 86400,
    "multiple": false,
    "hide_totals": false
  },
  "in_reply_to_id": "parent_status_id",
  "sensitive": false,
  "spoiler_text": "Content warning",
  "visibility": "public|unlisted|private|direct",
  "language": "en",
  "scheduled_at": "2026-04-20T12:00:00.000Z"
}
```

**Visibility levels:**
- `public` — Visible on all timelines
- `unlisted` — Visible on profile, not on public timelines
- `private` — Followers only
- `direct` — Mentioned users only (like DM)

**Scheduled posts:**
- Set `scheduled_at` to ISO 8601 datetime
- Must be at least 5 minutes in the future
- Managed via `/api/v1/scheduled_statuses`

### 4B. Media Upload

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/v2/media` | POST | Upload media (async processing) |
| `GET /api/v1/media/{id}` | GET | Check upload status |
| `PUT /api/v1/media/{id}` | PUT | Update description/focus |

**Supported media:**
- Images: JPEG, PNG, GIF, WebP (up to 16 MB)
- Video: MP4, MOV, WebM (up to 99 MB, or instance-specific)
- Audio: MP3, OGG, WAV, FLAC, OPUS, AAC, M4A, 3GP
- Max 4 media attachments per post (images) or 1 video/audio

### 4C. Timelines

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/v1/timelines/home` | GET | Home timeline |
| `GET /api/v1/timelines/public` | GET | Public/federated timeline |
| `GET /api/v1/timelines/tag/{hashtag}` | GET | Hashtag timeline |
| `GET /api/v1/timelines/list/{list_id}` | GET | List timeline |

### 4D. Notifications

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/v1/notifications` | GET | All notifications |
| `GET /api/v1/notifications/{id}` | GET | Single notification |
| `POST /api/v1/notifications/clear` | POST | Clear all |
| `POST /api/v1/notifications/{id}/dismiss` | POST | Dismiss one |

**Notification types:** `mention`, `status`, `reblog`, `follow`, `follow_request`, `favourite`, `poll`, `update`, `admin.sign_up`, `admin.report`

### 4E. Conversations (DMs)

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/v1/conversations` | GET | List conversations |
| `DELETE /api/v1/conversations/{id}` | DELETE | Remove conversation |
| `POST /api/v1/conversations/{id}/read` | POST | Mark as read |

**Note:** DMs in Mastodon are statuses with `visibility: "direct"`. There's no separate messaging system. Send a DM by creating a status mentioning the user with `visibility: "direct"`.

### 4F. Search

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/v2/search` | GET | Search accounts, statuses, hashtags |

**Parameters:** `q` (query), `type` (accounts/statuses/hashtags), `resolve` (attempt WebFinger lookup), `limit`

### 4G. Accounts & Relationships

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/v1/accounts/{id}` | GET | Account info |
| `GET /api/v1/accounts/{id}/statuses` | GET | Account's posts |
| `GET /api/v1/accounts/{id}/followers` | GET | Followers |
| `GET /api/v1/accounts/{id}/following` | GET | Following |
| `POST /api/v1/accounts/{id}/follow` | POST | Follow |
| `POST /api/v1/accounts/{id}/unfollow` | POST | Unfollow |
| `POST /api/v1/accounts/{id}/block` | POST | Block |
| `POST /api/v1/accounts/{id}/mute` | POST | Mute |
| `GET /api/v1/accounts/relationships` | GET | Relationship status (batch) |

### 4H. Lists

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/v1/lists` | GET | List all lists |
| `POST /api/v1/lists` | POST | Create list |
| `PUT /api/v1/lists/{id}` | PUT | Update list |
| `DELETE /api/v1/lists/{id}` | DELETE | Delete list |
| `GET /api/v1/lists/{id}/accounts` | GET | List members |
| `POST /api/v1/lists/{id}/accounts` | POST | Add to list |
| `DELETE /api/v1/lists/{id}/accounts` | DELETE | Remove from list |

### 4I. Streaming (WebSocket)

```
wss://{instance}/api/v1/streaming
  ?access_token={TOKEN}
  &stream=user|public|hashtag|list
```

**Events:** `update` (new post), `notification`, `delete`, `filters_changed`, `status.update` (edited post)

---

## 5. Rate Limits

| Category | Limit | Window |
|---|---|---|
| **Default (all endpoints)** | 300 requests | 5 minutes |
| **Media upload** (`POST /api/v1/media`) | 30 requests | 30 minutes |
| **Status deletion / unreblog** | 30 requests | 30 minutes |
| **Account creation** (`POST /api/v1/accounts`) | 5 requests | 30 minutes (per IP) |
| **App registration** (`POST /api/v1/apps`) | 5 requests | 10 minutes (per IP) |

**Rate limit headers:**
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 298
X-RateLimit-Reset: 2026-04-17T12:05:00.000Z
```

**Note:** Limits are per account + per IP. Instance admins can customize these defaults.

---

## 6. Current State vs What's Possible

| Capability | Current (`mastodon.ts`) | API Supports | Gap |
|---|---|---|---|
| **Text posting** | Yes | Yes + CW, language, visibility | Partial (may need CW/language) |
| **Image posting** | Yes | Up to 4 images with alt text | Implemented |
| **Video posting** | Yes | Video + audio | Implemented |
| **Poll creation** | Supported in types | 2-4 options with duration | May need verification |
| **Scheduled posts** | Not implemented | `scheduled_at` parameter | Full gap |
| **Post editing** | Not implemented | `PUT /api/v1/statuses/{id}` | Full gap |
| **Boost/Favourite** | Not implemented | Boost, favourite, bookmark, pin | Full gap |
| **Replies** | Not implemented | `in_reply_to_id` + thread context | Full gap |
| **Conversations (DMs)** | Not implemented | Direct visibility statuses | Full gap |
| **Notifications** | Not implemented | All notification types | Full gap |
| **Timelines** | Not implemented | Home, public, hashtag, list | Full gap |
| **Search** | Not implemented | Accounts, statuses, hashtags | Full gap |
| **Streaming** | Not implemented | WebSocket real-time updates | Full gap |
| **Lists** | Not implemented | Full CRUD + member management | Full gap |
| **Relationships** | Not implemented | Follow, block, mute, batch check | Full gap |

---

## 7. Implementation Priority

### Phase 1: Engagement (Low effort, high value)
- Boost/unboost posts
- Favourite/unfavourite
- Bookmark
- Reply to posts (in_reply_to_id)
- Estimate: 1-2 days

### Phase 2: Timelines & Threads (Medium effort, high value)
- Home timeline
- Post thread context (ancestors + descendants)
- Hashtag timeline
- Estimate: 2 days

### Phase 3: Notifications & DMs (Medium effort, high value)
- List notifications
- Mark as read/dismiss
- Direct messages (visibility: direct)
- List conversations
- Estimate: 2-3 days

### Phase 4: Search & Discovery (Low effort, medium value)
- Search accounts, statuses, hashtags
- WebFinger resolution for cross-instance users
- Estimate: 1 day

### Phase 5: Streaming (Medium effort, high value)
- WebSocket connection for real-time updates
- Process: new posts, notifications, deletes, edits
- Estimate: 2-3 days

### Phase 6: Scheduled Posts & Editing (Low effort, medium value)
- `scheduled_at` parameter
- Manage scheduled statuses
- Edit published posts
- Estimate: 1 day

### Not Constrained
- **Everything is available** — Mastodon API is fully open and well-documented
- **No app review** — No approval process
- **No rate tier pricing** — Free, open source
- **WebSocket streaming** — Real-time push (no polling needed)

---

## 8. Key Constraints & Gotchas

1. **Instance-based auth** — Must register app per instance. Store client credentials per instance URL.
2. **Tokens don't expire** — No refresh needed, but must handle revocation gracefully.
3. **DMs are statuses** — No separate messaging system. Use `visibility: "direct"` with @mentions.
4. **Instance variability** — Media size limits, character limits, and features vary by instance and version.
5. **Federation delay** — Posts may take seconds to minutes to propagate across instances.
6. **WebFinger for cross-instance** — Must resolve `@user@instance.social` format handles.
7. **300 req/5min default** — Generous but instance admins can lower it.
8. **Media async processing** — `POST /api/v2/media` returns before processing completes. Must poll.
9. **Edit history preserved** — Edited posts retain full edit history. Cannot "stealth edit."
10. **Content warnings (CW)** — Cultural norm on Mastodon. Should expose `spoiler_text` in UI.
11. **500 char default** — Default limit, but many instances increase to 1000-5000+.
12. **Streaming requires persistent connection** — WebSocket, not SSE. Must handle reconnection.
