# YouTube Data API v3 Reference — Platform Depth

> Reference for `src/platforms/youtube/` implementation
> Last updated: 2026-04-17

---

## 1. API Overview

YouTube provides two main APIs:
- **YouTube Data API v3** — CRUD for videos, channels, playlists, comments, subscriptions
- **YouTube Analytics API** — Channel and video performance metrics

Both use Google OAuth 2.0 and share a quota system.

### Base URLs
- Data API: `https://www.googleapis.com/youtube/v3/`
- Upload: `https://www.googleapis.com/upload/youtube/v3/`
- Analytics: `https://youtubeanalytics.googleapis.com/v2/`

### Quota System
- **10,000 units/day** per Google Cloud project (resets midnight Pacific)
- Video upload = 1,600 units (16% of daily quota)
- Read operations = 1 unit each
- Write/update/delete = 50 units each
- Caption operations = 200 units

---

## 2. OAuth 2.0 Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │ Google   │
│ Browser  │    │  Backend     │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  YouTube        │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Redirect to    │                 │
     │  accounts.google│                 │
     │  .com/o/oauth2/ │                 │
     │  v2/auth        │                 │
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
     │                 │  POST /token    │
     │                 │  {code, client_ │
     │                 │   id, secret,   │
     │                 │   redirect_uri} │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   refresh_token,│
     │                 │   expires_in,   │
     │                 │   scope}        │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token details:
- access_token: 1-hour lifetime
- refresh_token: no expiry (unless revoked)
- Must use access_type=offline + prompt=consent for refresh_token
- Refresh: POST /token with grant_type=refresh_token
```

### Authorization URL
```
GET https://accounts.google.com/o/oauth2/v2/auth
  ?client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &scope={SPACE_SEPARATED_SCOPES}
  &access_type=offline
  &prompt=consent
  &state={CSRF_TOKEN}
```

---

## 3. Scopes & Permissions

| Scope | Description | Required For |
|---|---|---|
| `youtube.readonly` | Read channel, videos, playlists | Basic read access |
| `youtube.upload` | Upload videos | Video publishing |
| `youtube.force-ssl` | Read/write comments, ratings, captions | Comments, moderation |
| `youtube` | Full management (channels, playlists, subscriptions) | All write operations |
| `yt-analytics.readonly` | Read analytics data | YouTube Analytics API |
| `yt-analytics-monetary.readonly` | Read revenue/ad analytics | Revenue reporting |

### Scope Sets by Feature

| Feature | Required Scopes |
|---|---|
| Upload video | `youtube.upload` |
| Read channel info | `youtube.readonly` |
| Manage comments | `youtube.force-ssl` |
| Read analytics | `yt-analytics.readonly` |
| Full management | `youtube`, `youtube.upload`, `youtube.force-ssl` |

---

## 4. API Capabilities Matrix

### 4A. Videos

| Endpoint | Method | Quota | Description |
|---|---|---|---|
| `GET /videos` | list | 1 | List videos (by ID, chart, myRating) |
| `POST /videos` | insert | 1,600 | Upload video |
| `PUT /videos` | update | 50 | Update metadata (title, description, tags) |
| `DELETE /videos/{id}` | delete | 50 | Delete video |
| `POST /videos/rate` | rate | 50 | Like/dislike a video |
| `GET /videos/getRating` | getRating | 1 | Get own rating |

**Video upload (resumable):**
```
Step 1: Initiate upload
  POST https://www.googleapis.com/upload/youtube/v3/videos
    ?uploadType=resumable
    &part=snippet,status
  Body: {
    "snippet": {
      "title": "Video Title",
      "description": "Description",
      "tags": ["tag1", "tag2"],
      "categoryId": "22"
    },
    "status": {
      "privacyStatus": "public|private|unlisted",
      "publishAt": "2026-04-20T12:00:00Z",
      "selfDeclaredMadeForKids": false
    }
  }
  → Response header: Location: {upload_url}

Step 2: Upload binary
  PUT {upload_url}
  Content-Type: video/*
  Content-Length: {file_size}
  Body: binary video data

Step 3: Video ID returned in response
```

**Shorts:** Videos with vertical aspect ratio (9:16) and duration <= 60s are automatically classified as Shorts.

**Scheduled publishing:** Set `privacyStatus: "private"` + `publishAt` datetime.

### 4B. Channels

| Endpoint | Method | Quota | Description |
|---|---|---|---|
| `GET /channels` | list | 1 | Get channel info (mine=true or by ID) |
| `PUT /channels` | update | 50 | Update channel branding settings |

**Channel fields:**
```
snippet: title, description, customUrl, thumbnails, country
statistics: viewCount, subscriberCount, videoCount
brandingSettings: channel, image, hints
contentDetails: relatedPlaylists (uploads, likes, favorites)
```

### 4C. Comments

| Endpoint | Method | Quota | Description |
|---|---|---|---|
| `GET /commentThreads` | list | 1 | List top-level comments on video |
| `POST /commentThreads` | insert | 50 | Post a top-level comment |
| `GET /comments` | list | 1 | List replies to a comment |
| `POST /comments` | insert | 50 | Reply to a comment |
| `PUT /comments` | update | 50 | Edit a comment |
| `DELETE /comments` | delete | 50 | Delete a comment |
| `POST /comments/setModerationStatus` | — | 50 | Approve/reject/hold comment |

**Comment moderation statuses:** `published`, `heldForReview`, `rejected`

### 4D. Playlists

| Endpoint | Method | Quota | Description |
|---|---|---|---|
| `GET /playlists` | list | 1 | List playlists |
| `POST /playlists` | insert | 50 | Create playlist |
| `PUT /playlists` | update | 50 | Update playlist |
| `DELETE /playlists` | delete | 50 | Delete playlist |
| `GET /playlistItems` | list | 1 | List items in playlist |
| `POST /playlistItems` | insert | 50 | Add video to playlist |
| `DELETE /playlistItems` | delete | 50 | Remove from playlist |

### 4E. Search

| Endpoint | Method | Quota | Description |
|---|---|---|---|
| `GET /search` | list | 100 | Search videos, channels, playlists |

**Note:** Search costs 100 units (10x a normal read). Use sparingly.

### 4F. YouTube Analytics API

| Endpoint | Method | Description |
|---|---|---|
| `GET /reports` | query | Channel and video performance data |

**Dimensions:** `day`, `video`, `country`, `ageGroup`, `gender`, `deviceType`, `operatingSystem`

**Metrics:**
- **Views:** `views`, `estimatedMinutesWatched`, `averageViewDuration`
- **Engagement:** `likes`, `dislikes`, `comments`, `shares`, `subscribersGained`, `subscribersLost`
- **Revenue:** `estimatedRevenue`, `estimatedAdRevenue`, `grossRevenue` (monetary scope)
- **Traffic:** `trafficSourceType`, `trafficSourceDetail`

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2026-04-01
  &endDate=2026-04-17
  &metrics=views,estimatedMinutesWatched,likes,comments
  &dimensions=day
  &sort=-views
```

---

## 5. Quota Costs Summary

| Operation | Units | Daily Budget Impact |
|---|---|---|
| Read/list | 1 | Negligible |
| Search | 100 | Expensive — avoid loops |
| Insert/update/delete | 50 | ~200 writes/day |
| Caption insert/update | 200 | 50 caption ops/day |
| **Video upload** | **1,600** | **6 uploads/day** |

---

## 6. Current State vs What's Possible

| Capability | Current (`youtube.ts`) | API Supports | Gap |
|---|---|---|---|
| **Video upload** | Resumable upload | Resumable + direct | Implemented |
| **Shorts** | Supported (by aspect ratio) | Auto-detected | Implemented |
| **Scheduled publish** | Not implemented | `publishAt` + private status | Full gap |
| **Comments** | Not implemented | Full CRUD + moderation | Full gap |
| **Playlists** | Not implemented | Full CRUD + add/remove videos | Full gap |
| **Analytics** | Not implemented | Views, watch time, engagement, traffic, revenue | Full gap |
| **Channel info** | Basic profile | Full branding + statistics | Partial gap |
| **Search** | Not implemented | Videos, channels, playlists | Full gap |
| **Captions** | Not implemented | Upload/manage subtitle tracks | Full gap |
| **Thumbnails** | Not implemented | Custom thumbnail upload | Full gap |
| **DMs** | Not possible | No messaging API | Blocked |
| **Webhooks** | Not possible | PubSubHubbub for feed updates only | Limited |

---

## 7. Implementation Priority

### Phase 1: Scheduled Publishing & Metadata (Low effort, high value)
- Add `publishAt` parameter for scheduled uploads
- Add category selection
- Custom thumbnail upload
- Estimate: 1 day

### Phase 2: Comments (Medium effort, high value)
- List comments on owned videos
- Reply to comments
- Comment moderation (hold/approve/reject)
- Estimate: 2-3 days

### Phase 3: Analytics (Medium effort, high value)
- Channel-level metrics (views, watch time, subscribers)
- Video-level metrics (per-video engagement)
- Audience demographics, traffic sources
- Requires `yt-analytics.readonly` scope
- Estimate: 2-3 days

### Phase 4: Playlists (Low effort, medium value)
- List, create, update, delete playlists
- Add/remove videos from playlists
- Estimate: 1-2 days

### Phase 5: Captions (Low effort, medium value)
- Upload SRT/VTT caption files
- List and manage caption tracks
- Estimate: 1-2 days

### Not Feasible / Constrained
- **DMs:** YouTube has no messaging API
- **Webhooks:** PubSubHubbub for new video notifications only
- **Live streaming:** Complex API, out of scope
- **Quota:** 6 uploads/day hard limit at default 10K. Must request increase.

---

## 8. Key Constraints & Gotchas

1. **6 videos/day at default quota** — Each upload = 1,600 of 10,000 units. Request quota increase.
2. **Failed requests still consume quota** — A 400 error on upload still costs 1,600 units.
3. **Search is expensive** — 100 units per call. Never use in loops.
4. **1-hour access tokens** — Refresh frequently. Refresh tokens don't expire unless revoked.
5. **Shorts auto-detection** — No explicit flag. Must be vertical (9:16) and <= 60 seconds.
6. **Analytics 24-48hr delay** — Not real-time.
7. **Parts system** — Must specify `part` parameter. Only request needed sections.
8. **ETags for caching** — Use conditional requests to save quota.
9. **Resumable upload required** — Direct upload has 5MB limit.
10. **Quota increase** — Request via Google Cloud Console. Common approval: 50K-100K units.
