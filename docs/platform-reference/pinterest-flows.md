# Pinterest API v5 Reference — Platform Depth

> Reference for `src/platforms/pinterest/` implementation
> Last updated: 2026-04-17

---

## 1. API Overview

Pinterest API v5 provides pin management, board organization, analytics, and user account features. Pinterest is a visual discovery platform — all content is image or video based.

### Base URL
- `https://api.pinterest.com/v5/`

### Access Requirements
- Pinterest Business account
- App registered at developers.pinterest.com
- App Review for production access
- Trial access available for testing (limited to app owner)

---

## 2. OAuth 2.0 Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │Pinterest │
│ Browser  │    │  Backend     │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  Pinterest      │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Redirect to    │                 │
     │  pinterest.com/ │                 │
     │  oauth/         │                 │
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
     │                 │  POST /v5/oauth │
     │                 │  /token         │
     │                 │  (Basic Auth    │
     │                 │   header)       │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   refresh_token,│
     │                 │   expires_in}   │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token details:
- access_token: 30-day lifetime
- refresh_token: 365-day lifetime
- Token exchange uses Basic Auth header (base64 client_id:client_secret)
- Refresh: POST /v5/oauth/token with grant_type=refresh_token
```

### Authorization URL
```
GET https://www.pinterest.com/oauth/
  ?client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &scope={COMMA_SEPARATED_SCOPES}
  &state={CSRF_TOKEN}
```

### Token Exchange (uses Basic Auth)
```
POST https://api.pinterest.com/v5/oauth/token
Authorization: Basic {base64(client_id:client_secret)}
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={AUTH_CODE}
&redirect_uri={REDIRECT_URI}
```

---

## 3. Scopes & Permissions

| Scope | Description | Required For |
|---|---|---|
| `user_accounts:read` | Read user account info | Profile display |
| `pins:read` | Read pins | Pin listing, analytics |
| `pins:write` | Create, update, delete pins | Pin management |
| `boards:read` | Read boards and sections | Board listing |
| `boards:write` | Create, update, delete boards | Board management |
| `pins:read:secret` | Read secret pins | Private pin access |
| `boards:read:secret` | Read secret boards | Private board access |
| `catalogs:read` | Read product catalogs | Shopping features |
| `catalogs:write` | Manage product catalogs | Shopping features |

---

## 4. API Capabilities Matrix

### 4A. Pins

| Endpoint | Method | Description |
|---|---|---|
| `POST /v5/pins` | POST | Create pin |
| `GET /v5/pins` | GET | List own pins |
| `GET /v5/pins/{pin_id}` | GET | Get pin details |
| `PATCH /v5/pins/{pin_id}` | PATCH | Update pin |
| `DELETE /v5/pins/{pin_id}` | DELETE | Delete pin |
| `POST /v5/pins/{pin_id}/save` | POST | Save pin to board |
| `GET /v5/pins/{pin_id}/analytics` | GET | Pin-level analytics |

**Create pin:**
```json
POST /v5/pins
{
  "title": "Pin title",
  "description": "Pin description with keywords",
  "link": "https://example.com/page",
  "board_id": "board_id",
  "board_section_id": "section_id",
  "media_source": {
    "source_type": "image_url",
    "url": "https://example.com/image.jpg"
  },
  "alt_text": "Image description for accessibility"
}
```

**Media source types:**
- `image_url` — Public image URL
- `image_base64` — Base64 encoded image
- `video_id` — Previously uploaded video ID
- `multiple_image_urls` — Multi-image pin (carousel)

**Pin types supported:**
- Standard image pin
- Video pin
- Carousel pin (multiple images)
- Idea pin (multi-page/story format)
- Shopping pin (with product tags)

### 4B. Video Upload

```
Step 1: Register upload
  POST /v5/media
  { "media_type": "video" }
  → { "media_id": "...", "upload_url": "...", "upload_parameters": {...} }

Step 2: Upload video
  POST {upload_url}
  Content-Type: multipart/form-data
  Include upload_parameters as form fields + file

Step 3: Check status
  GET /v5/media/{media_id}
  → { "status": "registered|processing|succeeded|failed" }

Step 4: Create pin with video
  POST /v5/pins
  { "media_source": { "source_type": "video_id", "media_id": "..." } }
```

### 4C. Boards

| Endpoint | Method | Description |
|---|---|---|
| `POST /v5/boards` | POST | Create board |
| `GET /v5/boards` | GET | List boards |
| `GET /v5/boards/{board_id}` | GET | Get board details |
| `PATCH /v5/boards/{board_id}` | PATCH | Update board |
| `DELETE /v5/boards/{board_id}` | DELETE | Delete board |
| `GET /v5/boards/{board_id}/pins` | GET | List pins on board |
| `POST /v5/boards/{board_id}/sections` | POST | Create board section |
| `GET /v5/boards/{board_id}/sections` | GET | List sections |
| `PATCH /v5/boards/{board_id}/sections/{id}` | PATCH | Update section |
| `DELETE /v5/boards/{board_id}/sections/{id}` | DELETE | Delete section |
| `GET /v5/boards/{board_id}/sections/{id}/pins` | GET | List pins in section |

**Board privacy:** `PUBLIC`, `PROTECTED` (only owner + collaborators), `SECRET` (only owner)

### 4D. Analytics

| Endpoint | Method | Description |
|---|---|---|
| `GET /v5/user_account/analytics` | GET | Account-level analytics |
| `GET /v5/user_account/analytics/top_pins` | GET | Top 50 pins by metric |
| `GET /v5/user_account/analytics/top_video_pins` | GET | Top video pins |
| `GET /v5/pins/{pin_id}/analytics` | GET | Per-pin analytics |
| `GET /v5/pins/analytics` | GET | Batch pin analytics (beta) |

**Account analytics metrics:**
- `IMPRESSION` — Number of times pins were shown
- `PIN_CLICK` — Clicks on pin
- `OUTBOUND_CLICK` — Clicks to external URL
- `SAVE` — Pin saves
- `SAVE_RATE` — Save rate
- `TOTAL_ENGAGEMENT` — All interactions

**Analytics parameters:**
```
GET /v5/user_account/analytics
  ?start_date=2026-04-01
  &end_date=2026-04-17
  &metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE
  &app_types=ALL
  &split_field=NO_SPLIT|PIN_FORMAT
```

**Pin analytics:**
```
GET /v5/pins/{pin_id}/analytics
  ?start_date=2026-04-01
  &end_date=2026-04-17
  &metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK
  &app_types=ALL
```

### 4E. User Account

| Endpoint | Method | Description |
|---|---|---|
| `GET /v5/user_account` | GET | Own account info |
| `GET /v5/user_account/businesses` | GET | Linked business accounts |
| `GET /v5/user_account/followers` | GET | Follower list |
| `GET /v5/user_account/following` | GET | Following list |
| `GET /v5/user_account/following/boards` | GET | Followed boards |
| `POST /v5/user_account/following/{username}` | POST | Follow user (beta) |
| `GET /v5/user_account/websites` | GET | Claimed websites |
| `POST /v5/user_account/websites` | POST | Verify website |

### 4F. Product Tags (Shopping)

| Endpoint | Method | Description |
|---|---|---|
| `POST /v5/pins/{pin_id}/product_tags` | POST | Add product tags (max 24) |
| `GET /v5/pins/{pin_id}/product_tags` | GET | List product tags |
| `POST /v5/pins/{pin_id}/product_tags/bulk-delete` | POST | Remove tags |

### 4G. Search (Limited)

| Endpoint | Method | Description |
|---|---|---|
| `GET /v5/search/boards` | GET | Search own boards |
| `GET /v5/search/pins` | GET | Search own pins |

**Note:** Cannot search other users' content via API. Only own content.

---

## 5. Rate Limits

| Category | Limit | Window |
|---|---|---|
| **Write operations** | 10 requests | 1 minute (per user) |
| **Read operations** | 200 requests | 1 minute (per user) |
| **Pin creation** | 25 pins/day per user | 24 hours |
| **Board creation** | 10 boards/day per user | 24 hours |
| **Media upload** | Included in write limit | — |
| **Analytics** | Included in read limit | — |

**Rate limit headers:**
```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 195
X-RateLimit-Reset: 1713372000
```

**Error codes:**
- 429 — Rate limit exceeded
- Use `Retry-After` header for backoff

---

## 6. Current State vs What's Possible

| Capability | Current (`pinterest.ts`) | API Supports | Gap |
|---|---|---|---|
| **Image pin** | Single image | Image, carousel, idea | Missing carousel, idea |
| **Video pin** | Not implemented | Full video upload flow | Full gap |
| **Pin metadata** | Title, description, link | + alt text, board section | Partial gap |
| **Boards** | Not implemented | Full CRUD + sections | Full gap |
| **Board sections** | Not implemented | Create, list, manage | Full gap |
| **Analytics** | Not implemented | Account + pin-level metrics | Full gap |
| **Top pins** | Not implemented | Top 50 by metric | Full gap |
| **Followers** | Not implemented | List followers/following | Full gap |
| **Search** | Not implemented | Own boards/pins | Full gap |
| **Product tags** | Not implemented | Shopping pins | Full gap |
| **DMs** | Not possible | No messaging API | Blocked |
| **Comments** | Not possible | No comment API | Blocked |
| **Webhooks** | Not possible | No webhook support | Blocked |

---

## 7. Implementation Priority

### Phase 1: Video & Carousel Pins (Medium effort, high value)
- Video upload flow (register → upload → poll → create pin)
- Carousel pins (multiple_image_urls)
- Alt text support
- Estimate: 2-3 days

### Phase 2: Boards (Low effort, high value)
- List boards and sections
- Create boards (needed for pin organization)
- Board section management
- Estimate: 1-2 days

### Phase 3: Analytics (Medium effort, high value)
- Account-level analytics (impressions, clicks, saves)
- Per-pin analytics
- Top pins report
- Estimate: 2 days

### Phase 4: User & Social (Low effort, medium value)
- Followers/following lists
- Follow users (beta)
- Claimed websites
- Estimate: 1 day

### Not Feasible
- **Comments:** Pinterest has no comment API
- **DMs:** No messaging API
- **Webhooks:** No real-time push notifications
- **Public search:** Cannot search other users' content
- **Reactions:** No reaction/like API for pins

---

## 8. Key Constraints & Gotchas

1. **Visual-only platform** — Every pin must have an image or video. No text-only posts.
2. **25 pins/day** — Strict daily creation limit. Much lower than other platforms.
3. **10 writes/minute** — Very tight write rate limit. Must queue operations.
4. **Basic Auth for tokens** — Token exchange uses HTTP Basic Auth (base64 encoded), not form-based.
5. **30-day access tokens** — Shorter than most Meta platforms (60-day) but longer than TikTok (24hr).
6. **Business account required** — Personal accounts cannot use the API.
7. **No comment or reaction API** — Cannot read or write comments or reactions on pins.
8. **No webhooks** — Must poll for changes. No real-time push.
9. **Search is self-only** — API search only covers own content. Cannot discover other users' pins.
10. **Video upload is multi-step** — Register → upload → poll status → create pin. Cannot do in one call.
11. **Board required** — Every pin must be saved to a board. Must create boards before pins.
12. **App Review required** — Production apps need Pinterest review. Trial mode limited to app owner.
