# Instagram API Reference — Platform Depth

> Reference for `src/platforms/instagram/` implementation
> Last updated: 2026-04-17

---

## 1. API Products & Access Paths

Instagram has two API entry points — choose based on login type:

| API | Login Type | Best For |
|---|---|---|
| **Instagram Graph API** (via Facebook Login) | Facebook OAuth | Apps that also manage Facebook Pages |
| **Instagram API with Instagram Login** | Instagram OAuth | Instagram-only apps (simpler) |

Both require an **Instagram Business** or **Creator** account linked to a Facebook Page.

### Permission Groups by Login Type

| Feature | Facebook Login Permissions | Instagram Login Permissions |
|---|---|---|
| Basic profile | `instagram_basic` | `instagram_business_basic` |
| Content publishing | `instagram_content_publish`, `pages_read_engagement` | `instagram_business_content_publish` |
| Comment management | `instagram_manage_comments`, `pages_read_engagement` | `instagram_business_manage_comments` |
| Messaging | `instagram_manage_messages`, `pages_manage_metadata` | `instagram_business_manage_messages` |
| Insights/Analytics | `instagram_manage_insights`, `pages_read_engagement` | `instagram_business_manage_insights` |

**Recommendation for our app:** Use Instagram Login path — fewer permissions needed, no Facebook Page dependency in the OAuth flow itself.

---

## 2. OAuth 2.0 Flow

### 2A. Instagram Login (Recommended Path)

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │Instagram │
│ Browser  │    │  Backend     │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  Instagram      │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Redirect to    │                 │
     │  www.instagram  │                 │
     │  .com/oauth/    │                 │
     │  authorize?...  │                 │
     │<────────────────│                 │
     │                 │                 │
     │  User logs in   │                 │
     │  + authorizes   │                 │
     │─────────────────────────────────>│
     │                 │                 │
     │  Redirect to    │                 │
     │  callback_url   │                 │
     │  ?code=AUTH_CODE│                 │
     │<─────────────────────────────────│
     │                 │                 │
     │  Forward code   │                 │
     │────────────────>│                 │
     │                 │                 │
     │                 │  POST /oauth/   │
     │                 │  access_token   │
     │                 │  {code, client_ │
     │                 │   id, secret,   │
     │                 │   redirect_uri, │
     │                 │   grant_type}   │
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
     │                 │   token_type,   │
     │                 │   expires_in}   │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token lifecycle:
- Short-lived: ~1 hour
- Long-lived: 60 days (exchange immediately after auth)
- Refresh: GET /refresh_access_token before expiry
- Long-lived tokens can be refreshed if at least 24hr old
```

### 2B. Authorization URL

```
GET https://www.instagram.com/oauth/authorize
  ?client_id={APP_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &scope={COMMA_SEPARATED_SCOPES}
  &state={CSRF_TOKEN}
```

**Note:** Scopes are comma-separated (not space-separated like most OAuth).

### 2C. Local Redirect URI Setup

Meta validates `redirect_uri` by exact string match. Scheme, host, port, path,
and trailing slash all matter. `localhost` and `127.0.0.1` are different hosts.
`http` and `https` are different schemes.

Social Poster uses one shared callback path for Instagram Login:

```text
/api/auth/callback
```

Use this matrix when testing locally:

| Where the app is opened | Command | Generated redirect URI | Register in Meta? | Use when |
|---|---|---|---|---|
| `https://127.0.0.1:3000` | `npm run dev:https` | `https://127.0.0.1:3000/api/auth/callback` | Yes | Preferred local Meta OAuth test |
| `https://localhost:3000` | `npm run dev:https` | `https://localhost:3000/api/auth/callback` | Only if you open localhost | Avoid mixing with 127 |
| `http://localhost:3000` | `npm run dev` | `http://localhost:3000/api/auth/callback` | Only if Meta accepts HTTP loopback | Usually not preferred |
| `http://127.0.0.1:3000` | `npm run dev` | `http://127.0.0.1:3000/api/auth/callback` | Only if Meta accepts HTTP loopback | Usually not preferred |
| `https://*.ngrok-free.app` | `ngrok http 3000` | `https://<ngrok-host>/api/auth/callback` | Yes, exact current ngrok host | Mobile/external HTTPS tunnel to local code |
| `https://social.maxpetrusenko.com` | production | `https://social.maxpetrusenko.com/api/auth/callback` | Yes | Production |

The app blocks unsupported local HTTP Instagram OAuth starts before redirecting
to Meta. This keeps local tests from producing Meta's `Invalid redirect_uri`
screen. Use `npm run dev:https` and open `https://127.0.0.1:3000`, or use an
HTTPS tunnel.

`https://d87e-2600-1700-512b-8200-1c63-72d2-58c7-86f2.ngrok-free.app/api/auth/callback`
is an example ngrok callback. It is not production. It is a temporary public
HTTPS tunnel to a local dev server. Ngrok hostnames change unless a reserved
domain is configured, so add the current exact ngrok callback during a local
test and remove stale ones later.

For the current Meta app, keep at least:

```text
https://social.maxpetrusenko.com/api/auth/callback
https://127.0.0.1:3000/api/auth/callback
```

Debug the exact app-generated URI without leaving the app:

```text
http://localhost:3000/api/auth/instagram?debug=oauth
https://127.0.0.1:3000/api/auth/instagram?debug=oauth
```

The debug endpoint is local-only and non-production.

### 2D. Token Exchange (Short-Lived)

```
POST https://api.instagram.com/oauth/access_token
Content-Type: application/x-www-form-urlencoded

client_id={APP_ID}
&client_secret={APP_SECRET}
&grant_type=authorization_code
&redirect_uri={REDIRECT_URI}
&code={AUTH_CODE}
```

### 2E. Exchange for Long-Lived Token

```
GET https://graph.instagram.com/access_token
  ?grant_type=ig_exchange_token
  &client_secret={APP_SECRET}
  &access_token={SHORT_LIVED_TOKEN}
```

### 2F. Refresh Long-Lived Token

```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token={LONG_LIVED_TOKEN}
```

---

## 3. Scopes & Permissions

### Instagram Login Scopes

| Scope | Description | Required For |
|---|---|---|
| `instagram_business_basic` | Profile info, media list | Always (base scope) |
| `instagram_business_content_publish` | Publish posts, reels, stories | Posting |
| `instagram_business_manage_comments` | Read/reply/delete comments | Comment management |
| `instagram_business_manage_messages` | Read/send DMs | Messaging |
| `instagram_business_manage_insights` | Account and media insights | Analytics |

### Facebook Login Scopes (Alternative)

| Scope | Description |
|---|---|
| `instagram_basic` | Profile info |
| `instagram_content_publish` | Publish content |
| `instagram_manage_comments` | Comment management |
| `instagram_manage_messages` | DM management |
| `instagram_manage_insights` | Analytics |
| `pages_read_engagement` | Required for all IG operations via FB Login |
| `pages_manage_metadata` | Required for messaging via FB Login |

---

## 4. API Capabilities Matrix

### 4A. Content Publishing

Instagram uses a **two-step container-based publish flow:**

```
Step 1: Create container
  POST /{IG_USER_ID}/media
  → Returns container_id (creation_id)

Step 2: Publish container  
  POST /{IG_USER_ID}/media_publish
  ?creation_id={CONTAINER_ID}
  → Returns published media_id

Step 3 (optional): Check status
  GET /{CONTAINER_ID}?fields=status_code
  → FINISHED | IN_PROGRESS | ERROR
```

**Content types:**

| Type | Endpoint | Key Parameters |
|---|---|---|
| **Single Image** | `POST /{id}/media` | `image_url`, `caption`, `location_id` |
| **Carousel** | `POST /{id}/media` (per item) + `POST /{id}/media` (carousel container) | `children` (2-10 items), `caption` |
| **Reel** | `POST /{id}/media` | `video_url`, `caption`, `share_to_feed`, `cover_url`, `audio_name` |
| **Story** | `POST /{id}/media` | `image_url` or `video_url`, `media_type=STORIES` |
| **Trial Reel** | `POST /{id}/media` | `video_url`, `audience=TRIAL_AUDIENCE` |

**Single image post:**
```json
POST /{IG_USER_ID}/media
{
  "image_url": "https://example.com/photo.jpg",
  "caption": "Post caption with #hashtags @mentions",
  "location_id": "optional_location_id",
  "user_tags": [
    { "username": "friend", "x": 0.5, "y": 0.5 }
  ]
}
```

**Carousel post (multi-step):**
```
1. Create each child container:
   POST /{id}/media?image_url=URL1&is_carousel_item=true
   POST /{id}/media?image_url=URL2&is_carousel_item=true
   POST /{id}/media?video_url=URL3&is_carousel_item=true

2. Create carousel container:
   POST /{id}/media?media_type=CAROUSEL&children=id1,id2,id3&caption=text

3. Publish:
   POST /{id}/media_publish?creation_id=carousel_container_id
```

**Reel post:**
```json
POST /{IG_USER_ID}/media
{
  "video_url": "https://example.com/video.mp4",
  "caption": "Reel caption",
  "media_type": "REELS",
  "share_to_feed": true,
  "cover_url": "https://example.com/cover.jpg",
  "thumb_offset": 2000
}
```

### 4B. Media Requirements

| Type | Format | Max Size | Aspect Ratio | Duration |
|---|---|---|---|---|
| Image | JPEG only | 8 MB | 4:5 to 1.91:1 | — |
| Carousel image | JPEG only | 8 MB | Must be consistent across items | — |
| Carousel video | MP4, MOV | 1 GB | Must be consistent | 3-60s |
| Reel | MP4, MOV | 1 GB | 9:16 recommended | 3s-15min |
| Story image | JPEG | 8 MB | 9:16 | — |
| Story video | MP4, MOV | 100 MB | 9:16 | 1-60s |

### 4C. Resumable Video Upload

For large videos, use resumable upload:
```
1. POST /{IG_USER_ID}/media
   { "media_type": "REELS", "upload_type": "resumable" }
   → Returns { "id": container_id, "uri": upload_uri }

2. Upload binary to upload_uri:
   POST {upload_uri}
   Headers:
     offset: 0
     file_size: {total_bytes}
   Body: binary video data

3. Check upload status:
   GET /{container_id}?fields=status_code

4. Publish when FINISHED:
   POST /{IG_USER_ID}/media_publish?creation_id={container_id}
```

### 4D. Comments API

| Endpoint | Method | Description |
|---|---|---|
| `GET /{media_id}/comments` | GET | List comments on a media object |
| `POST /{media_id}/comments` | POST | Reply to a post (top-level comment) |
| `POST /{comment_id}/replies` | POST | Reply to a specific comment |
| `GET /{comment_id}/replies` | GET | List replies on a comment |
| `DELETE /{comment_id}` | DELETE | Delete a comment (own or on own media) |
| `PATCH /{media_id}` | PATCH | Enable/disable comments (`comment_enabled`) |

**Comment fields:**
```
id, text, timestamp, username, from, like_count,
replies { data { id, text, timestamp, username } },
parent_id, hidden, media
```

### 4E. Messaging (DMs)

| Endpoint | Method | Description |
|---|---|---|
| `GET /{IG_USER_ID}/conversations` | GET | List DM conversations |
| `GET /{conversation_id}` | GET | Get messages in conversation |
| `POST /{IG_USER_ID}/messages` | POST | Send a message |

**Send message:**
```json
POST /{IG_USER_ID}/messages
{
  "recipient": { "id": "{USER_ID}" },
  "message": { "text": "Hello!" }
}
```

**Message types:** Text, image, generic template (image + title + buttons), product template

**Messaging rate limits:**
- 200 messages/hour per IG account
- 1000 messages/24 hours
- Can only message users who messaged first (24-hour window for human agent, 7-day for standard messages)

**Webhooks for messaging:**
- `messages` — New incoming messages
- `messaging_postbacks` — Button clicks from templates
- `message_reactions` — Reactions to messages

### 4F. Insights (Analytics)

**Account-level insights:**

| Metric | Description | Period |
|---|---|---|
| `impressions` | Total impressions | day, week, days_28 |
| `reach` | Unique accounts reached | day, week, days_28 |
| `follower_count` | Total followers | day |
| `profile_views` | Profile views | day |
| `website_clicks` | Website link clicks | day |
| `email_contacts` | Email button clicks | day |

```
GET /{IG_USER_ID}/insights
  ?metric=impressions,reach,follower_count
  &period=day
  &since=2026-04-01
  &until=2026-04-17
```

**Media-level insights:**

| Metric | Applies To | Description |
|---|---|---|
| `impressions` | Image, Video, Carousel | Total views |
| `reach` | Image, Video, Carousel | Unique views |
| `engagement` | Image, Video, Carousel | Likes + comments + saves |
| `saved` | Image, Video, Carousel | Saves count |
| `video_views` | Video, Reel | Video views |
| `plays` | Reel | Total plays |
| `total_interactions` | Reel | All interactions |
| `likes` | Reel | Like count |
| `comments` | Reel | Comment count |
| `shares` | Reel | Share count |

```
GET /{MEDIA_ID}/insights
  ?metric=impressions,reach,engagement,saved
```

**Audience demographics (account level):**
```
GET /{IG_USER_ID}/insights
  ?metric=audience_city,audience_country,audience_gender_age,audience_locale
  &period=lifetime
```

### 4G. Hashtag Search

| Endpoint | Method | Description |
|---|---|---|
| `GET /ig_hashtag_search` | GET | Search hashtag ID by name |
| `GET /{hashtag_id}/top_media` | GET | Top 9 media for hashtag |
| `GET /{hashtag_id}/recent_media` | GET | Recent media for hashtag |

Limit: 30 unique hashtag lookups per 7-day period per IG user.

### 4H. Business Discovery

```
GET /{IG_USER_ID}?fields=business_discovery.fields(
  username,name,biography,followers_count,media_count,
  media{caption,like_count,comments_count,timestamp}
).username({TARGET_USERNAME})
```

Can look up public business/creator accounts — useful for competitive analysis.

---

## 5. Rate Limits

| Category | Limit | Window |
|---|---|---|
| **API-published posts** | 100 posts | 24-hour rolling |
| **Carousel child containers** | 100 containers | 24-hour rolling |
| **API calls (general)** | 200 calls/user/hour | 1 hour |
| **Comment creation** | Included in general limit | — |
| **Hashtag searches** | 30 unique hashtags | 7 days |
| **Business discovery** | Included in general limit | — |
| **Messaging** | 200 messages/hour, 1000/day | Rolling |
| **Content Publishing checks** | Poll every 30s, timeout at 2min | Per container |

**Error codes:**
- `(#4)` — Application-level rate limit
- `(#17)` — User-level rate limit
- `(#9004)` — Container not ready (poll again)
- `(#36003)` — Media not eligible for publishing
- `(#9007)` — Permission error

---

## 6. Webhook Subscriptions

| Event | Description | Use Case |
|---|---|---|
| `comments` | New/edited/deleted comments | Comment monitoring |
| `mentions` | @mentions in captions/comments | Engagement tracking |
| `messages` | New DMs received | Inbox management |
| `messaging_postbacks` | Template button clicks | DM automation |
| `message_reactions` | Reactions to DMs | Engagement tracking |
| `story_insights` | Story metrics (when story expires) | Analytics |

**Webhook setup:**
```
POST /{APP_ID}/subscriptions
{
  "object": "instagram",
  "callback_url": "https://our-app.com/webhooks/instagram",
  "fields": "comments,mentions,messages",
  "verify_token": "{OUR_VERIFY_TOKEN}"
}
```

---

## 7. Current State vs What's Possible

| Capability | Current (`instagram.ts`) | API Supports | Gap |
|---|---|---|---|
| **Image posting** | Single image | Single, carousel, stories | Missing carousel, stories |
| **Video posting** | Not implemented | Reels (up to 15min), stories | Full gap |
| **Carousel** | Not implemented | Up to 10 mixed items | Full gap |
| **Comments** | Not implemented | Full CRUD + reply threads | Full gap |
| **DMs** | Not implemented | Send/receive text, images, templates | Full gap |
| **Analytics** | Not implemented | Account + media + audience insights | Full gap |
| **Webhooks** | Not implemented | Comments, mentions, messages | Full gap |
| **Hashtag search** | Not implemented | Top/recent media by hashtag | Full gap |
| **Business discovery** | Not implemented | Lookup any business account | Full gap |
| **Content scheduling** | Client-side only | Container + delayed publish | Could use server-side |

---

## 8. Implementation Priority

### Phase 1: Complete Publishing (Medium effort, critical)
- Add carousel support (multi-image posts)
- Add Reel upload (video + resumable upload)
- Add Story publishing
- Implement container status polling with retry
- Estimate: 3-4 days

### Phase 2: Comments & Engagement (Medium effort, high value)
- List comments on owned media
- Reply to comments (top-level and threaded)
- Delete comments
- Enable/disable comments per post
- Estimate: 2 days

### Phase 3: Analytics (Medium effort, high value)
- Account-level insights (impressions, reach, followers)
- Media-level insights (per-post engagement)
- Audience demographics
- Estimate: 2-3 days

### Phase 4: Messaging (High effort, high value)
- List conversations
- Read message threads
- Send messages (text, image, template)
- Webhook for incoming messages
- Estimate: 3-4 days

### Phase 5: Discovery & Monitoring (Low effort, medium value)
- Hashtag search + top/recent media
- Business discovery for competitor analysis
- Webhook setup for comments and mentions
- Estimate: 2 days

### Not Feasible / Constrained
- **Organic scheduling via API:** No native "schedule for later" param — must use our own scheduler
- **Story insights real-time:** Only available via webhook when story expires (24hr)
- **Posting to personal (non-business) accounts:** Not supported by API
- **Editing published posts:** Only caption can be edited, not media

---

## 9. Key Constraints & Gotchas

1. **Container model is async** — After creating container, must poll `status_code` until `FINISHED` before publishing. Can take 30s+ for video.
2. **JPEG only for images** — PNG, WebP, GIF not supported. Must convert client-side or server-side.
3. **Carousel items must match aspect ratio** — All images/videos in a carousel must have consistent dimensions.
4. **100 posts/24hr hard limit** — Includes all API-published content (posts + reels + stories + carousels).
5. **Business/Creator account required** — Personal accounts cannot use the API at all.
6. **Facebook Page linkage required** — Even with Instagram Login, the IG account must be linked to an FB Page.
7. **24-hour messaging window** — Can only reply to users who messaged within the last 24 hours (human agent) or 7 days (standard).
8. **Hashtag search budget** — Only 30 unique hashtags per 7 days. Cannot do broad monitoring.
9. **60-day token expiry** — Must proactively refresh long-lived tokens. Token becomes unrefreshable if expired.
10. **Video URL must be public** — `video_url` param requires a publicly accessible URL (no auth headers). Must use signed URLs or public CDN.
11. **No edit media** — Can update caption but cannot replace image/video after publishing.
12. **Resumable upload for large videos** — Videos over a few MB should use resumable upload to avoid timeouts.
