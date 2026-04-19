# TikTok API Reference — Platform Depth

> Reference for `src/platforms/tiktok/` implementation
> Last updated: 2026-04-17

---

## 1. API Overview

TikTok's developer platform provides Content Posting API for video/photo uploads, Display API for reading user content, and Login Kit for OAuth. All API access requires app registration and compliance audit.

### Base URL
- `https://open.tiktokapis.com/v2/`

### Access Requirements
- TikTok for Developers account
- App with Content Posting API product enabled
- Direct Post configuration enabled in app settings
- Compliance audit for public content (unaudited = private only)

---

## 2. OAuth 2.0 Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │ TikTok   │
│ Browser  │    │  Backend     │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  TikTok         │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Redirect to    │                 │
     │  tiktok.com/v2/ │                 │
     │  auth/authorize │                 │
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
     │                 │  POST /v2/oauth │
     │                 │  /token/        │
     │                 │  {code, client_ │
     │                 │   key, secret}  │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   refresh_token,│
     │                 │   open_id,      │
     │                 │   expires_in}   │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token details:
- access_token: 24-hour lifetime
- refresh_token: 365-day lifetime
- Refresh via POST /v2/oauth/token/ with grant_type=refresh_token
- Uses client_key (not client_id)
```

### Authorization URL
```
GET https://www.tiktok.com/v2/auth/authorize/
  ?client_key={CLIENT_KEY}
  &redirect_uri={REDIRECT_URI}
  &scope={COMMA_SEPARATED_SCOPES}
  &response_type=code
  &state={CSRF_TOKEN}
```

---

## 3. Scopes & Permissions

| Scope | Description | Required For |
|---|---|---|
| `user.info.basic` | Username, avatar, display name | Profile display |
| `user.info.profile` | Bio, verified status | Extended profile |
| `user.info.stats` | Follower/following/likes/video count | Analytics |
| `video.publish` | Upload and post videos | Video posting |
| `video.upload` | Upload video files | Video upload step |
| `video.list` | List user's videos | Content management |
| `comment.list` | Read comments on videos | Comment reading |
| `comment.list.manage` | Manage (delete) comments | Comment moderation |
| `insight.basic` | Video-level analytics | Analytics |

---

## 4. API Capabilities Matrix

### 4A. Content Publishing

**Two upload paths:**

```
Path A: File Upload
  1. POST /v2/post/publish/video/init/
     { "source_info": { "source": "FILE_UPLOAD", "video_size": N, "chunk_size": M } }
     → { "publish_id", "upload_url" }
  
  2. PUT {upload_url}
     Content-Range: bytes 0-{N-1}/{total}
     Body: binary video data
     (chunk if needed)
  
  3. POST /v2/post/publish/status/fetch/
     { "publish_id": "..." }
     → Poll until status = published

Path B: Pull from URL
  1. POST /v2/post/publish/video/init/
     { "source_info": { "source": "PULL_FROM_URL", "video_url": "https://..." } }
     → { "publish_id" }
  
  2. Poll status until published
```

**Photo posting:**
```json
POST /v2/post/publish/content/init/
{
  "post_info": {
    "title": "Caption text",
    "description": "Optional",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_comment": false,
    "auto_add_music": true
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "photo_cover_index": 0,
    "photo_images": [
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg"
    ]
  },
  "post_mode": "DIRECT_POST",
  "media_type": "PHOTO"
}
```

**Post configuration:**

| Option | Values | Applies To |
|---|---|---|
| `privacy_level` | `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, `SELF_ONLY` | All |
| `disable_comment` | boolean | All |
| `disable_duet` | boolean | Video only |
| `disable_stitch` | boolean | Video only |
| `video_cover_timestamp_ms` | integer (ms) | Video only |
| `auto_add_music` | boolean | Photo only |

### 4B. Creator Info Query

```json
POST /v2/post/publish/creator_info/query/
→ {
    "creator_avatar_url": "...",
    "creator_username": "...",
    "creator_nickname": "...",
    "privacy_level_options": ["PUBLIC_TO_EVERYONE", ...],
    "comment_disabled": false,
    "duet_disabled": false,
    "stitch_disabled": false,
    "max_video_post_duration_sec": 600
  }
```

### 4C. Status Checking

```json
POST /v2/post/publish/status/fetch/
{ "publish_id": "..." }
→ {
    "status": "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "PUBLISH_COMPLETE" | "FAILED",
    "fail_reason": "...",
    "publicaly_available_post_id": ["video_id"],
    "uploaded_bytes": 12345,
    "upload_url": "..."
  }
```

### 4D. Video List (Display API)

| Endpoint | Method | Description |
|---|---|---|
| `POST /v2/video/list/` | POST | List user's videos (paginated) |
| `POST /v2/video/query/` | POST | Query specific videos by IDs |

**Video fields:** `id`, `title`, `video_description`, `duration`, `cover_image_url`, `share_url`, `create_time`, `like_count`, `comment_count`, `share_count`, `view_count`

### 4E. Comments

| Endpoint | Method | Description |
|---|---|---|
| `POST /v2/comment/list/` | POST | List comments on a video |
| `POST /v2/comment/list/manage/` | POST | Delete comments |

**Comment fields:** `id`, `text`, `create_time`, `like_count`, `reply_count`, `parent_comment_id`

**Note:** Cannot create comments via API — read and delete only.

### 4F. User Info

| Endpoint | Method | Description |
|---|---|---|
| `GET /v2/user/info/` | GET | Get user profile + stats |

**Stats fields (with `user.info.stats`):** `follower_count`, `following_count`, `likes_count`, `video_count`

---

## 5. Rate Limits

| Endpoint | Limit | Window |
|---|---|---|
| `/v2/user/info/` | 600 requests | 1 minute |
| `/v2/video/query/` | 600 requests | 1 minute |
| `/v2/video/list/` | 600 requests | 1 minute |
| `/v2/post/publish/video/init/` | Not explicitly documented | Per-app basis |
| `/v2/post/publish/status/fetch/` | Not explicitly documented | Per-app basis |
| **Overall** | Per-app limits | Sliding 1-min window |

**Throttling:** HTTP 429 with `rate_limit_exceeded` error code.

**Video constraints:**
- Max video duration: varies by creator (up to 600s / 10 min)
- Domain/URL prefix must be verified for URL-based uploads

---

## 6. Media Requirements

| Type | Format | Duration | Notes |
|---|---|---|---|
| Video | MP4 + H.264 | 3s-600s (10 min) | Vertical 9:16 recommended |
| Photo | WEBP recommended, JPEG/PNG | — | URL-based only (no direct upload) |

---

## 7. Current State vs What's Possible

| Capability | Current (`tiktok.ts`) | API Supports | Gap |
|---|---|---|---|
| **Video posting** | File upload + URL | File upload + URL pull | Implemented |
| **Photo posting** | Not implemented | URL-based multi-photo | Full gap |
| **Post status check** | Implemented (polling) | publish_id polling | Implemented |
| **Privacy control** | Implemented | 4 levels | Implemented |
| **Comment reading** | Scopes requested | List + threaded replies | Implementation gap |
| **Comment deletion** | Scopes requested | Delete own/on-own-video | Implementation gap |
| **Comment creation** | Not possible | Not available via API | Blocked |
| **Video list** | Not implemented | Paginated video list | Full gap |
| **Video analytics** | Not implemented | View/like/comment/share counts | Full gap |
| **User stats** | Not implemented | Follower/following/likes/videos | Full gap |
| **Creator info** | Not implemented | Privacy options, limits | Full gap |
| **DMs** | Not possible | No DM API | Blocked |
| **Webhooks** | Not possible | Webhook for content status only | Very limited |

---

## 8. Implementation Priority

### Phase 1: Photo Posting (Medium effort, high value)
- Implement photo upload via URL-based flow
- Support multi-photo posts
- Add auto_add_music option
- Estimate: 2 days

### Phase 2: Video Analytics & Lists (Low effort, high value)
- Implement video list endpoint
- Extract view_count, like_count, comment_count, share_count
- User stats (followers, following, likes)
- Estimate: 1-2 days

### Phase 3: Comments (Low effort, medium value)
- List comments on videos (already have scopes)
- Threaded reply reading
- Comment deletion/moderation
- Estimate: 1-2 days

### Phase 4: Creator Info (Low effort, low value)
- Query creator privacy options and limits
- Use to dynamically configure UI options
- Estimate: 0.5 days

### Not Feasible
- **Comment creation:** TikTok API does not support posting comments
- **DMs:** No messaging API exists
- **Webhooks:** Only content posting status webhooks (no engagement events)
- **Live streaming:** Separate API product, not in scope
- **Duet/Stitch creation:** Not available via API

---

## 9. Key Constraints & Gotchas

1. **Compliance audit required** — Unaudited apps can only post as private (SELF_ONLY). Must pass audit for public posts.
2. **24-hour access tokens** — Much shorter than other platforms. Must refresh frequently.
3. **Domain verification** — URL-based uploads require verified domain/prefix in TikTok developer portal.
4. **Photo = URL only** — Cannot directly upload photo files. Must host on public URL first.
5. **No comment creation** — Can only read and delete comments, not post them.
6. **Video-first platform** — Photo posting is newer and more limited.
7. **client_key not client_id** — TikTok uses `client_key` parameter name (our provider already handles this).
8. **open_id** — TikTok returns `open_id` as user identifier (not a standard user_id).
9. **Chunked upload** — Large videos must use `Content-Range` header for chunked uploads.
10. **Status polling** — Must poll `/status/fetch/` after upload. Can take 30s+ for processing.
