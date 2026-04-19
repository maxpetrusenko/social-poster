# Facebook Pages API Reference — Platform Depth

> Reference for `src/platforms/facebook/` implementation
> Last updated: 2026-04-17

---

## 1. API Overview

Facebook's Graph API for Pages allows managing Facebook Page content, comments, messaging, and analytics. All operations are on **Pages** (not personal profiles — personal profile posting via API was deprecated in 2018).

### API Version
- Current stable: `v21.0` (as of early 2026)
- Base URL: `https://graph.facebook.com/v21.0/`
- Version lifecycle: ~2 years per version before deprecation

### Access Levels

| Level | Description | Requirements |
|---|---|---|
| **Development** | Testing only, limited users | App creation |
| **Standard** | Production use | App Review approval per permission |
| **Advanced** | Higher rate limits | Business Verification + additional review |

---

## 2. OAuth 2.0 Flow

### 2A. Login Flow for Page Access

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │ Facebook │
│ Browser  │    │  Backend     │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  Facebook       │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Redirect to    │                 │
     │  facebook.com/  │                 │
     │  v21.0/dialog/  │                 │
     │  oauth?...      │                 │
     │<────────────────│                 │
     │                 │                 │
     │  User logs in   │                 │
     │  + selects      │                 │
     │  pages to grant │                 │
     │  access to      │                 │
     │─────────────────────────────────>│
     │                 │                 │
     │  Redirect with  │                 │
     │  ?code=AUTH_CODE│                 │
     │<─────────────────────────────────│
     │                 │                 │
     │  Forward code   │                 │
     │────────────────>│                 │
     │                 │                 │
     │                 │  Exchange code  │
     │                 │  for USER token │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   expires_in}   │
     │                 │<────────────────│
     │                 │                 │
     │                 │  GET /me/       │
     │                 │  accounts       │
     │                 │  (list pages)   │
     │                 │────────────────>│
     │                 │                 │
     │                 │  [{page_id,     │
     │                 │    name,        │
     │                 │    access_token,│
     │                 │    ...}]        │
     │                 │<────────────────│
     │                 │                 │
     │  Select which   │                 │
     │  Page to use    │                 │
     │────────────────>│                 │
     │                 │                 │
     │                 │  Store PAGE     │
     │                 │  access_token   │
     │                 │  (never expires)│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token hierarchy:
1. User access token (short-lived: ~1hr, or long-lived: 60 days)
2. Page access token (derived from user token via /me/accounts)
   - Page tokens from long-lived user tokens NEVER expire
   - Store the PAGE token, not the user token
```

### 2B. Authorization URL

```
GET https://www.facebook.com/v21.0/dialog/oauth
  ?client_id={APP_ID}
  &redirect_uri={REDIRECT_URI}
  &state={CSRF_TOKEN}
  &scope={COMMA_SEPARATED_SCOPES}
  &response_type=code
```

### 2C. Token Exchange

```
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?client_id={APP_ID}
  &redirect_uri={REDIRECT_URI}
  &client_secret={APP_SECRET}
  &code={AUTH_CODE}
```

### 2D. Exchange for Long-Lived User Token

```
GET https://graph.facebook.com/v21.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={SHORT_LIVED_TOKEN}
```

### 2E. Get Page Access Token (from User Token)

```
GET https://graph.facebook.com/v21.0/me/accounts
  ?access_token={USER_ACCESS_TOKEN}

Response:
{
  "data": [
    {
      "id": "123456789",
      "name": "My Business Page",
      "access_token": "PAGE_ACCESS_TOKEN_NEVER_EXPIRES",
      "category": "Business",
      "tasks": ["ADVERTISE", "ANALYZE", "CREATE_CONTENT", "MANAGE", "MODERATE"]
    }
  ]
}
```

**Critical:** Get page token from a long-lived user token — the resulting page token never expires and doesn't need refresh.

---

## 3. Scopes & Permissions

| Scope | Description | Review Required |
|---|---|---|
| `pages_show_list` | List pages user manages | No (default) |
| `pages_read_engagement` | Read page posts, comments, likes | Yes |
| `pages_manage_posts` | Create, edit, delete page posts | Yes |
| `pages_manage_engagement` | Create/delete comments, like as page | Yes |
| `pages_read_user_content` | Read user posts on page, tagged content | Yes |
| `pages_manage_metadata` | Manage page settings, subscribe webhooks | Yes |
| `pages_messaging` | Send/receive Messenger messages | Yes |
| `pages_manage_ads` | Manage page advertising | Yes |
| `read_insights` | Read page and post insights | Yes |
| `business_management` | Manage business assets | Yes |

### Scope Sets by Feature

| Feature | Required Scopes |
|---|---|
| Post to Page | `pages_manage_posts`, `pages_read_engagement` |
| Read + reply to comments | `pages_manage_engagement`, `pages_read_engagement` |
| Read user posts on page | `pages_read_user_content` |
| Messenger conversations | `pages_messaging` |
| Page insights/analytics | `read_insights`, `pages_read_engagement` |
| Webhook subscriptions | `pages_manage_metadata` |

---

## 4. API Capabilities Matrix

### 4A. Page Publishing

| Endpoint | Method | Description |
|---|---|---|
| `POST /{page_id}/feed` | POST | Create text/link post |
| `POST /{page_id}/photos` | POST | Upload photo post |
| `POST /{page_id}/videos` | POST | Upload video post |
| `GET /{post_id}` | GET | Read a post |
| `POST /{post_id}` | POST | Update a post (edit text) |
| `DELETE /{post_id}` | DELETE | Delete a post |
| `GET /{page_id}/feed` | GET | List page feed |
| `GET /{page_id}/published_posts` | GET | List published posts |
| `GET /{page_id}/scheduled_posts` | GET | List scheduled posts |

**Text post:**
```json
POST /{page_id}/feed
{
  "message": "Post text here",
  "link": "https://example.com"  // optional
}
```

**Photo post:**
```json
POST /{page_id}/photos
{
  "url": "https://example.com/photo.jpg",
  "caption": "Photo caption"
}
// OR multipart upload:
POST /{page_id}/photos
Content-Type: multipart/form-data
  source={binary_image}
  caption="Photo caption"
```

**Multi-photo post:**
```
1. Upload each photo as unpublished:
   POST /{page_id}/photos?published=false&url=URL1 → {id: photo1}
   POST /{page_id}/photos?published=false&url=URL2 → {id: photo2}

2. Create post with attached photos:
   POST /{page_id}/feed
   {
     "message": "Caption",
     "attached_media[0]": {"media_fbid": "photo1"},
     "attached_media[1]": {"media_fbid": "photo2"}
   }
```

**Video post:**
```json
POST /{page_id}/videos
Content-Type: multipart/form-data
  source={binary_video}
  title="Video Title"
  description="Video description"
```

**Resumable video upload (for large files):**
```
1. Start upload session:
   POST /{page_id}/videos
   { "upload_phase": "start", "file_size": 157286400 }
   → { "upload_session_id": "123", "video_id": "456" }

2. Upload chunks:
   POST /{page_id}/videos
   { "upload_phase": "transfer",
     "upload_session_id": "123",
     "start_offset": 0,
     "video_file_chunk": {binary} }
   → { "start_offset": 52428800, "end_offset": 104857600 }
   (repeat until start_offset == end_offset)

3. Finish upload:
   POST /{page_id}/videos
   { "upload_phase": "finish",
     "upload_session_id": "123",
     "title": "Video Title",
     "description": "Description" }
```

**Scheduled posts:**
```json
POST /{page_id}/feed
{
  "message": "Scheduled post",
  "scheduled_publish_time": 1714000000,
  "published": false
}
```

**Note:** `scheduled_publish_time` must be 10 min to 30 days in the future.

### 4B. Comments API

| Endpoint | Method | Description |
|---|---|---|
| `GET /{post_id}/comments` | GET | List comments on a post |
| `POST /{post_id}/comments` | POST | Comment as page on a post |
| `GET /{comment_id}` | GET | Read a comment |
| `POST /{comment_id}` | POST | Update a comment |
| `DELETE /{comment_id}` | DELETE | Delete a comment |
| `GET /{comment_id}/comments` | GET | List replies to a comment |
| `POST /{comment_id}/comments` | POST | Reply to a comment |

**Comment as Page:**
```json
POST /{post_id}/comments
{
  "message": "Reply from the page"
}
// Automatically posts as the Page (when using Page access token)
```

**Comment fields:**
```
id, message, created_time, from{id,name}, 
like_count, comment_count, attachment,
parent{id}, is_hidden, can_comment
```

**Comment filtering:**
```
GET /{post_id}/comments?filter=stream  // chronological
GET /{post_id}/comments?filter=toplevel  // top-level only
```

### 4C. Reactions API

| Endpoint | Method | Description |
|---|---|---|
| `GET /{post_id}/reactions` | GET | List reactions with types |

**Reaction types:** `LIKE`, `LOVE`, `WOW`, `HAHA`, `SAD`, `ANGRY`, `CARE`, `PRIDE`

```
GET /{post_id}/reactions?type=LIKE&summary=total_count
```

**Note:** Cannot create reactions via API — read-only. Pages can only "like" via comments.

### 4D. Messenger (Page Messaging)

| Endpoint | Method | Description |
|---|---|---|
| `GET /{page_id}/conversations` | GET | List Messenger conversations |
| `GET /{conversation_id}/messages` | GET | List messages in thread |
| `POST /{page_id}/messages` | POST | Send message |

**Send message:**
```json
POST /me/messages
{
  "recipient": { "id": "{USER_PSID}" },
  "message": { "text": "Hello from the page!" }
}
```

**Message types:**
- Text messages
- Image/video/file attachments
- Generic template (image + title + subtitle + buttons)
- Button template (text + buttons)
- Receipt template
- Quick replies

**Messaging constraints:**
- **24-hour messaging window:** Can only send messages to users who messaged within the last 24 hours
- **Message tags:** Can send outside the window using approved tags (CONFIRMED_EVENT_UPDATE, POST_PURCHASE_UPDATE, ACCOUNT_UPDATE, HUMAN_AGENT)
- **HUMAN_AGENT tag:** 7-day window but requires approval

**Messaging webhooks:**
```
messages — New incoming messages
messaging_postbacks — Button/quick-reply clicks
messaging_optins — User opt-ins
message_deliveries — Delivery receipts
message_reads — Read receipts
```

### 4E. Page Insights (Analytics)

**Page-level metrics:**

| Metric | Description | Period |
|---|---|---|
| `page_impressions` | Total impressions | day, week, days_28 |
| `page_impressions_unique` | Unique reach | day, week, days_28 |
| `page_engaged_users` | Users who engaged | day, week, days_28 |
| `page_fans` | Total page likes | day |
| `page_fan_adds` | New page likes | day |
| `page_fan_removes` | Unlikes | day |
| `page_views_total` | Page views | day |
| `page_post_engagements` | Post clicks, reactions, comments, shares | day, week, days_28 |
| `page_video_views` | Video views (3s+) | day |
| `page_fans_city` | Fans by city | day |
| `page_fans_country` | Fans by country | day |
| `page_fans_gender_age` | Fans by gender and age | day |

```
GET /{page_id}/insights
  ?metric=page_impressions,page_engaged_users,page_fans
  &period=day
  &since=2026-04-01
  &until=2026-04-17
```

**Post-level metrics:**

| Metric | Description |
|---|---|
| `post_impressions` | Total post impressions |
| `post_impressions_unique` | Unique post reach |
| `post_engaged_users` | Users who clicked anywhere |
| `post_clicks` | Link clicks, photo views, etc. |
| `post_reactions_like_total` | Like reactions |
| `post_reactions_love_total` | Love reactions |
| `post_reactions_by_type_total` | All reaction types breakdown |
| `post_activity` | Stories created from post (shares) |
| `post_video_views` | Video views (videos only) |

```
GET /{post_id}/insights
  ?metric=post_impressions,post_engaged_users,post_reactions_by_type_total
```

### 4F. Page Management

| Endpoint | Method | Description |
|---|---|---|
| `GET /{page_id}` | GET | Read page info |
| `POST /{page_id}` | POST | Update page info (limited fields) |
| `GET /{page_id}/tagged` | GET | Posts tagging the page |
| `GET /{page_id}/visitor_posts` | GET | Visitor posts on page wall |

---

## 5. Rate Limits

### Application-Level Rate Limiting

```
Limit = 200 * (daily_active_users) per hour

Example:
- 100 DAU = 20,000 calls/hour
- 1,000 DAU = 200,000 calls/hour
- New app with 0 DAU = 200 calls/hour (minimum)
```

### Business Use Case (BUC) Rate Limiting

For Pages API operations, Meta uses BUC rate limiting:

```
Limit = 4800 * (engaged_users_of_page) per 24 hours

Example:
- Page with 1,000 engaged users = 4,800,000 calls/24hr
- New page with 100 engaged users = 480,000 calls/24hr
```

### Per-Endpoint Limits

| Operation | Limit | Notes |
|---|---|---|
| Post creation | No explicit per-endpoint limit | Subject to BUC |
| Photo upload | No explicit per-endpoint limit | Subject to BUC |
| Video upload | 1000 videos/day per page | Separate limit |
| Comment creation | No explicit limit | Subject to BUC |
| Messenger send | 250 messages/second (app) | High throughput |
| Insights reads | No explicit limit | Subject to BUC |
| Batch requests | 50 calls per batch | Built-in batching |

### Rate Limit Headers

```
X-App-Usage: {
  "call_count": 28,        // % of app limit used
  "total_cputime": 15,     // % of CPU time used
  "total_time": 12         // % of total time used
}

X-Business-Use-Case-Usage: {
  "{business_id}": [{
    "type": "pages",
    "call_count": 100,
    "total_cputime": 25,
    "total_time": 40,
    "estimated_time_to_regain_access": 0
  }]
}
```

**Throttling behavior:**
- 80-100% usage: Warnings but still allowed
- 100%+: HTTP 429, `error.code` = 4 (app-level) or 32 (Pages BUC)
- `estimated_time_to_regain_access`: minutes until limit resets

### Error Codes

| Code | Meaning | Action |
|---|---|---|
| 4 | Application rate limit | Back off, check X-App-Usage |
| 17 | User rate limit | Wait for window reset |
| 32 | Pages rate limit (BUC) | Check X-Business-Use-Case-Usage |
| 80001 | Posting too quickly | Wait before next post |
| 80002 | Too many posts to page | Daily limit hit |
| 80003 | Too many calls (edge-specific) | Back off on that endpoint |
| 80004 | Too many photos uploaded | Photo limit hit |
| 80005 | Too many comments | Comment limit hit |
| 80006 | Too many API calls | General API limit |
| 80008 | Too many Messenger messages | Message throttle |
| 80014 | Too many video uploads | Video limit hit |

---

## 6. Webhook Subscriptions

| Field | Description | Use Case |
|---|---|---|
| `feed` | New posts on page (by page or visitors) | Content monitoring |
| `mention` | Page @mentioned in a post | Engagement tracking |
| `messages` | New Messenger messages | Inbox management |
| `messaging_postbacks` | Button clicks in Messenger | Bot automation |
| `message_reads` | Message read receipts | Delivery tracking |
| `message_deliveries` | Message delivery receipts | Delivery tracking |
| `messaging_optins` | User opt-ins | Subscription management |
| `ratings` | Page reviews/ratings | Reputation monitoring |
| `leadgen` | New lead gen form submissions | Lead capture |

**Webhook setup:**
```
POST /{APP_ID}/subscriptions
{
  "object": "page",
  "callback_url": "https://our-app.com/webhooks/facebook",
  "fields": "feed,mention,messages",
  "verify_token": "{OUR_VERIFY_TOKEN}",
  "access_token": "{APP_ACCESS_TOKEN}"
}
```

**Then subscribe the page:**
```
POST /{page_id}/subscribed_apps
{
  "subscribed_fields": "feed,mention,messages",
  "access_token": "{PAGE_ACCESS_TOKEN}"
}
```

---

## 7. Current State vs What's Possible

| Capability | Current (`facebook.ts`) | API Supports | Gap |
|---|---|---|---|
| **Text posting** | Text + link | Text, link, scheduled posts | Missing scheduling |
| **Photo posting** | Single photo | Single + multi-photo (unpublished → attach) | Missing multi-photo |
| **Video posting** | Not implemented | Upload, resumable upload, live video | Full gap |
| **Scheduled posts** | Not implemented | Native `scheduled_publish_time` | Full gap |
| **Comments** | Not implemented | Full CRUD + threaded replies | Full gap |
| **Reactions** | Not implemented | Read-only (list by type, counts) | Full gap |
| **Messenger** | Not implemented | Send/receive text, media, templates | Full gap |
| **Analytics** | Not implemented | Page + post insights, demographics | Full gap |
| **Webhooks** | Not implemented | feed, mention, messages, leadgen | Full gap |
| **Page info** | Basic page name/ID | Full page metadata | Minimal gap |
| **User/visitor posts** | Not implemented | Read visitor posts, tagged content | Full gap |
| **Post editing** | Not implemented | Update message text of existing post | Full gap |

---

## 8. Implementation Priority

### Phase 1: Complete Publishing (Low-medium effort, critical)
- Add multi-photo post support (unpublished upload → attach)
- Add video upload (standard + resumable)
- Add scheduled post support (`scheduled_publish_time`)
- Add post editing and deletion
- Estimate: 2-3 days

### Phase 2: Comments & Engagement (Medium effort, high value)
- List comments on page posts
- Reply to comments as page
- Reply to specific comment threads
- List reactions with type breakdown
- Delete/hide inappropriate comments
- Estimate: 2 days

### Phase 3: Analytics (Medium effort, high value)
- Page-level insights (impressions, reach, fans, engagement)
- Post-level insights (per-post metrics)
- Audience demographics (city, country, gender, age)
- Video view analytics
- Estimate: 2-3 days

### Phase 4: Messenger (High effort, high value)
- List conversations
- Read message threads
- Send text messages
- Send rich messages (templates, quick replies)
- Webhook for incoming messages
- Estimate: 3-4 days

### Phase 5: Webhooks & Monitoring (Medium effort, medium value)
- Set up webhook endpoint
- Subscribe to feed, mention, messages
- Process incoming events
- Surface new comments/mentions in UI
- Estimate: 2-3 days

### Phase 6: Batch Operations (Low effort, performance optimization)
- Use batch API (50 calls per request) for:
  - Fetching insights for multiple posts
  - Checking multiple comment threads
  - Reading multiple conversation threads
- Estimate: 1 day

### Not Feasible / Constrained
- **Post as personal profile:** Deprecated since 2018, not available
- **Create reactions via API:** Read-only — pages cannot react to posts
- **Read user profiles:** Very limited fields available
- **Organic reach boost:** No API for boosting; requires ads API

---

## 9. Key Constraints & Gotchas

1. **Page token from long-lived user token never expires** — This is the golden pattern. Always exchange user token → long-lived → get page token. Store page token.
2. **Multi-photo requires unpublished uploads** — Must upload each photo with `published=false`, then create a feed post referencing them via `attached_media`.
3. **Scheduling window** — `scheduled_publish_time` must be 10 minutes to 30 days in the future. Outside this window = error.
4. **BUC rate limiting** — Scales with page engagement, not app users. New pages with low engagement have tight limits.
5. **App Review required** — Every permission beyond basic login requires Facebook App Review with screencast demo. Plan 2-6 weeks.
6. **24-hour messaging window** — Cannot initiate conversations or message outside the window without approved message tags.
7. **Reactions are read-only** — Can list and count reactions but cannot create them programmatically.
8. **Video upload can be slow** — Large videos should use resumable upload. Standard upload times out for files over ~100 MB.
9. **Graph API versioning** — Must pin version (e.g., `v21.0`). Versions deprecated ~2 years after release. Must update periodically.
10. **Webhooks need HTTPS** — Callback URL must be HTTPS with valid SSL certificate. Webhook verification uses GET with `hub.challenge`.
11. **Post-level insights have minimum threshold** — Some metrics only available after post reaches minimum impressions.
12. **Batch API = 50 max** — Each batch request can contain up to 50 individual API calls. Useful but not unlimited.
