# X/Twitter API v2 Reference for Social Poster

> Complete reference for X API v2 capabilities, auth flows, rate limits, and scopes
> Last updated: April 2026

---

## 1. API Tier Comparison

### Current Pricing (2025-2026)

| Feature                    | Free          | Basic           | Pro             | Enterprise      |
|---------------------------|---------------|-----------------|-----------------|-----------------|
| **Monthly cost**           | $0            | $200            | $5,000          | $42,000+        |
| **App IDs**                | 1             | 2               | 3               | Custom          |
| **Post writes/month**      | 500 (user)    | 50,000 (app)    | 300,000 (app)   | Custom          |
| **Post reads/month**       | 100 (app)     | 15,000 (app)    | 1,000,000 (app) | Custom          |
| **Search: recent**         | No            | 7-day history   | Full archive    | Full archive    |
| **Search: full archive**   | No            | No              | Yes             | Yes             |
| **Filtered stream**        | No            | No              | Yes             | Yes             |
| **DM endpoints**           | No            | Limited (1/day) | Yes             | Yes             |
| **Analytics endpoint**     | No            | No              | Yes             | Yes             |
| **Media upload**           | Yes           | Yes             | Yes             | Yes             |
| **Webhooks/Activity API**  | No            | No              | Yes             | Yes             |
| **Dedicated support**      | No            | No              | No              | Yes             |

**Note**: X previously had a $100/mo Basic tier. In 2025 it was raised to $200/mo. There is now also a "Pay-per-use" option for some tiers. The Free tier is severely limited (write-only, essentially for bots).

### What We Need for Social Poster

For a scheduling and analytics tool like ours, the **Basic tier ($200/mo)** provides:
- Posting tweets (50,000/mo is more than enough for scheduling)
- Reading tweets (15,000/mo for analytics pulls)
- Media upload (images, video)
- User lookup
- 7-day recent search (for engagement builder keyword search)

**Missing from Basic** (would need Pro at $5K/mo):
- Full archive search
- Analytics endpoint (`/2/tweets/analytics`)
- Filtered stream
- DMs beyond 1/day (critical gap for auto-DM features)
- Activity/webhook subscriptions

---

## 2. OAuth 2.0 Authorization Code Flow with PKCE

### Flow Diagram

```
 ┌──────────┐                          ┌──────────┐                    ┌──────────┐
 │  User's   │                          │  Our App  │                    │  X API    │
 │  Browser  │                          │  Server   │                    │  Server   │
 └─────┬────┘                          └─────┬────┘                    └─────┬────┘
       │                                      │                              │
       │  1. Click "Connect X"                │                              │
       │ ────────────────────────────────────> │                              │
       │                                      │                              │
       │                                      │  2. Generate:                │
       │                                      │     - state (CSRF token)     │
       │                                      │     - code_verifier (random) │
       │                                      │     - code_challenge =       │
       │                                      │       SHA256(code_verifier)  │
       │                                      │                              │
       │  3. Redirect to X authorize URL      │                              │
       │ <─────────────────────────────────── │                              │
       │                                      │                              │
       │  GET https://twitter.com/i/oauth2/authorize                        │
       │  ?response_type=code                                                │
       │  &client_id=<CLIENT_ID>                                             │
       │  &redirect_uri=<CALLBACK_URL>                                       │
       │  &state=<STATE>                                                     │
       │  &code_challenge=<CHALLENGE>                                        │
       │  &code_challenge_method=S256                                        │
       │  &scope=tweet.read+tweet.write+users.read+offline.access            │
       │ ──────────────────────────────────────────────────────────────────> │
       │                                      │                              │
       │  4. User authorizes app              │                              │
       │ <────────────────────────────────────────────────────────────────── │
       │                                      │                              │
       │  5. Redirect to callback with code   │                              │
       │     ?code=<AUTH_CODE>&state=<STATE>   │                              │
       │ ────────────────────────────────────> │                              │
       │                                      │                              │
       │                                      │  6. Validate state matches   │
       │                                      │                              │
       │                                      │  7. Exchange code for token  │
       │                                      │  POST /2/oauth2/token        │
       │                                      │  {                           │
       │                                      │    code: <AUTH_CODE>,        │
       │                                      │    grant_type:               │
       │                                      │      authorization_code,     │
       │                                      │    client_id: <CLIENT_ID>,   │
       │                                      │    redirect_uri: <CALLBACK>, │
       │                                      │    code_verifier:            │
       │                                      │      <CODE_VERIFIER>         │
       │                                      │  }                           │
       │                                      │ ──────────────────────────> │
       │                                      │                              │
       │                                      │  8. Receive tokens           │
       │                                      │  {                           │
       │                                      │    access_token: "...",      │
       │                                      │    refresh_token: "...",     │
       │                                      │    expires_in: 7200,         │
       │                                      │    token_type: "bearer",     │
       │                                      │    scope: "..."              │
       │                                      │  }                           │
       │                                      │ <────────────────────────── │
       │                                      │                              │
       │                                      │  9. Store tokens securely    │
       │                                      │     (encrypted in DB)        │
       │                                      │                              │
       │  10. Show "Connected!" to user       │                              │
       │ <─────────────────────────────────── │                              │
       │                                      │                              │
```

### Token Refresh Flow

```
  ┌──────────┐                    ┌──────────┐
  │  Our App  │                    │  X API    │
  └─────┬────┘                    └─────┬────┘
        │                               │
        │  Access token expired          │
        │  (default: 2 hours)            │
        │                               │
        │  POST /2/oauth2/token          │
        │  {                             │
        │    refresh_token: "...",       │
        │    grant_type: refresh_token,  │
        │    client_id: <CLIENT_ID>      │
        │  }                             │
        │ ─────────────────────────────> │
        │                               │
        │  New access_token +            │
        │  new refresh_token             │
        │ <───────────────────────────── │
        │                               │
        │  Store new tokens,             │
        │  discard old ones              │
        │                               │
```

**Key details:**
- Access tokens expire in 2 hours by default
- `offline.access` scope is REQUIRED to get refresh tokens
- Refresh tokens allow indefinite access without re-authorization
- Auth code expires in 30 seconds (must exchange quickly)
- `state` parameter: up to 500 chars, used for CSRF protection
- Redirect URI must match exactly what's configured in Developer Console

---

## 3. Available Scopes

| Scope               | Description                                    | Needed For                |
|---------------------|------------------------------------------------|---------------------------|
| `tweet.read`        | Read tweets, timelines, search                 | Analytics, feed display   |
| `tweet.write`       | Post, delete, retweet tweets                   | Scheduling, autoplugs     |
| `tweet.moderate.write` | Hide/unhide replies                          | Reply management          |
| `users.read`        | Read user profile information                  | Profile display, lookup   |
| `users.email`       | Read user email (if available)                 | Account linking           |
| `follows.read`      | Read following/followers lists                 | Social graph features     |
| `follows.write`     | Follow/unfollow users                          | Auto-follow features      |
| `like.read`         | Read liked tweets                              | Analytics                 |
| `like.write`        | Like/unlike tweets                             | Engagement builder        |
| `dm.read`           | Read direct messages                           | DM inbox features         |
| `dm.write`          | Send direct messages                           | Auto-DM campaigns         |
| `list.read`         | Read lists                                     | List import for engage    |
| `list.write`        | Create/manage lists                            | List management           |
| `bookmark.read`     | Read bookmarks                                 | Bookmark sync             |
| `bookmark.write`    | Add/remove bookmarks                           | Bookmark management       |
| `block.read`        | Read blocked users                             | Safety features           |
| `block.write`       | Block/unblock users                            | Safety features           |
| `mute.read`         | Read muted users                               | Safety features           |
| `mute.write`        | Mute/unmute users                              | Safety features           |
| `space.read`        | Read Spaces information                        | Space discovery           |
| `offline.access`    | Get refresh token for long-lived access        | **ALWAYS REQUIRED**       |
| `media.write`       | Upload media (images, videos)                  | Media posting             |

### Recommended Scopes for Social Poster

**Minimum viable (scheduling only):**
```
tweet.read tweet.write users.read offline.access media.write
```

**Full feature set:**
```
tweet.read tweet.write tweet.moderate.write users.read follows.read
like.read like.write dm.read dm.write list.read bookmark.read
offline.access media.write
```

---

## 4. Endpoint Capabilities Matrix

### Posting & Content

| Endpoint                                      | Method | Auth          | Rate Limit (User) | Our Use Case             |
|-----------------------------------------------|--------|---------------|-------------------|--------------------------|
| `/2/tweets`                                   | POST   | OAuth 2.0     | 100/15min         | Schedule tweets          |
| `/2/tweets/:id`                               | DELETE | OAuth 2.0     | 50/15min          | Delete scheduled tweets  |
| `/2/tweets/:id`                               | GET    | OAuth 2.0     | 900/15min         | Fetch tweet details      |
| `/2/tweets`                                   | GET    | OAuth 2.0     | 5,000/15min       | Batch fetch tweets       |
| `/2/tweets/search/recent`                     | GET    | OAuth 2.0     | 300/15min         | Engagement builder       |
| `/2/users/:id/tweets`                         | GET    | OAuth 2.0     | 900/15min         | User timeline (history)  |
| `/2/users/:id/mentions`                       | GET    | OAuth 2.0     | 300/15min         | Mention tracking         |
| `/2/users/:id/timelines/reverse_chronological`| GET    | OAuth 2.0     | 180/15min         | Home timeline            |
| `/2/tweets/:tweet_id/hidden`                  | PUT    | OAuth 2.0     | 50/15min          | Hide replies             |

### Media Upload

| Endpoint                        | Method | Rate Limit (User) | Our Use Case           |
|---------------------------------|--------|-------------------|------------------------|
| `/2/media/upload`               | POST   | 500/15min         | Simple image upload    |
| `/2/media/upload/initialize`    | POST   | 1,875/15min       | Chunked upload start   |
| `/2/media/upload/:id/append`    | POST   | 1,875/15min       | Chunked upload data    |
| `/2/media/upload/:id/finalize`  | POST   | 1,875/15min       | Chunked upload finish  |
| `/2/media/metadata`             | POST   | 500/15min         | Alt text, etc.         |

### Engagement & Social Graph

| Endpoint                                      | Method | Rate Limit (User) | Our Use Case           |
|-----------------------------------------------|--------|-------------------|------------------------|
| `/2/users/:id/likes`                          | POST   | 50/15min          | Like from engage feed  |
| `/2/users/:id/likes/:tweet_id`                | DELETE | 50/15min          | Unlike                 |
| `/2/users/:id/retweets`                       | POST   | 50/15min          | Retweet (evergreen)    |
| `/2/users/:id/retweets/:tweet_id`             | DELETE | 50/15min          | Undo retweet           |
| `/2/tweets/:id/quote_tweets`                  | GET    | 75/15min          | Track quote tweets     |
| `/2/tweets/:id/liking_users`                  | GET    | 75/15min          | Who liked (autoplugs)  |
| `/2/tweets/:id/retweeted_by`                  | GET    | 75/15min          | Who retweeted          |
| `/2/users/:id/following`                      | GET    | 300/15min         | Following list         |
| `/2/users/:id/followers`                      | GET    | 300/15min         | Follower list          |

### Direct Messages

| Endpoint                                              | Method | Rate Limit (User)    | Our Use Case       |
|-------------------------------------------------------|--------|---------------------|---------------------|
| `/2/dm_conversations/with/:participant_id/messages`    | POST   | 15/15min, 1440/24hr | Auto-DM send       |
| `/2/dm_conversations`                                  | POST   | 15/15min, 1440/24hr | New DM conversation|
| `/2/dm_events`                                         | GET    | 15/15min            | Read DM events     |
| `/2/dm_conversations/:id/dm_events`                    | GET    | 15/15min            | Conversation DMs   |

**Critical DM limitation**: On Basic tier, DM creation is limited to **1 request/24 hours per user and per app**. This makes auto-DM campaigns impossible on Basic. Pro tier is required for meaningful DM automation.

### Analytics

| Endpoint                  | Method | Rate Limit       | Our Use Case            |
|--------------------------|--------|------------------|-------------------------|
| `/2/tweets/analytics`    | GET    | 300/15min        | Tweet performance data  |
| `/2/usage/tweets`        | GET    | 50/15min         | API usage monitoring    |

**Note**: Analytics endpoint requires Pro tier or higher.

### Users

| Endpoint                                    | Method | Rate Limit (User) | Our Use Case           |
|---------------------------------------------|--------|-------------------|------------------------|
| `/2/users/me`                               | GET    | 75/15min          | Get authenticated user |
| `/2/users/:id`                              | GET    | 900/15min         | User lookup            |
| `/2/users/by/username/:username`            | GET    | 900/15min         | Username lookup        |
| `/2/users/search`                           | GET    | 900/15min         | User search            |
| `/2/users/:id/blocking`                     | GET    | 15/15min          | Blocked users list     |
| `/2/users/:id/muting`                       | GET    | 15/15min          | Muted users list       |

### Lists

| Endpoint                          | Method | Rate Limit (User) | Our Use Case                |
|-----------------------------------|--------|-------------------|-----------------------------|
| `/2/lists/:id/tweets`             | GET    | 900/15min         | List feed (engage builder) |
| `/2/lists/:id/members`            | GET    | 900/15min         | Import list members        |
| `/2/users/:id/owned_lists`        | GET    | 15/15min          | Get user's lists           |
| `/2/users/:id/list_memberships`   | GET    | 75/15min          | List membership check      |

---

## 5. Authentication Mapping: What Method Per Endpoint

| Endpoint Category     | OAuth 1.0a | OAuth 2.0 App-Only | OAuth 2.0 + PKCE | Required Scopes               |
|-----------------------|-----------|--------------------|--------------------|-------------------------------|
| Tweet lookup/search   | Yes       | Yes                | Yes                | `tweet.read, users.read`      |
| Post/delete tweets    | Yes       | No                 | Yes                | `tweet.read, tweet.write, users.read` |
| Timelines             | Yes       | Yes                | Yes                | `tweet.read, users.read`      |
| Likes (read)          | Yes       | Yes                | Yes                | `tweet.read, users.read, like.read` |
| Likes (write)         | Yes       | No                 | Yes                | `tweet.read, users.read, like.write` |
| Retweets              | Yes       | No                 | Yes                | `tweet.read, users.read, tweet.write` |
| Bookmarks             | No        | No                 | **Yes (only)**     | `tweet.read, users.read, bookmark.read/write` |
| Follow/unfollow       | Yes       | No                 | Yes                | `tweet.read, users.read, follows.write` |
| Block/mute            | Yes       | No                 | Yes                | `tweet.read, users.read, block.write/mute.write` |
| DMs                   | Yes       | No                 | Yes                | `dm.read, dm.write`           |
| Lists                 | Yes       | Yes                | Yes                | `tweet.read, users.read, list.read/write` |
| Spaces                | No        | Yes                | Yes                | `space.read`                  |
| Filtered stream       | No        | **Yes (only)**     | No                 | N/A (app-only)                |
| Compliance            | No        | **Yes (only)**     | No                 | N/A (app-only)                |
| Media upload          | Yes       | No                 | Yes                | `media.write`                 |

**Runtime policy**: Social Poster uses Bird as the primary X publishing transport. OAuth 2.0 with PKCE can be kept connected for profile refresh, token refresh, delete support, and an operator-enabled publish fallback when the Bird connection explicitly opts into Direct X retry.

---

## 6. What We Have Now vs. What's Possible

### Current State (Social Poster)

| Capability            | Status        | Implementation             |
|----------------------|---------------|----------------------------|
| Post text tweets      | Implemented   | Bird primary, optional X API fallback |
| OAuth 2.0 PKCE auth   | Implemented   | Full flow with refresh     |
| Token refresh          | Implemented   | Automatic before expiry    |
| Post with media        | Implemented   | Bird primary, optional v2 chunked media fallback |
| Thread posting         | Not yet       | Chained `POST /2/tweets`   |
| Analytics              | Not yet       | Need Pro tier              |
| Auto-DM                | Not yet       | Need Pro tier for volume   |
| Engagement (likes)     | Not yet       | `POST /users/:id/likes`   |
| Engagement (retweets)  | Not yet       | `POST /users/:id/retweets`|
| User lookup            | Not yet       | `GET /2/users/me`          |
| Search/keyword feed    | Not yet       | `GET /2/tweets/search/recent` |
| List import            | Not yet       | `GET /2/lists/:id/members` |
| Schedule retweets      | Not yet       | `POST /users/:id/retweets` |
| Evergreen retweets     | Not yet       | Same as above, on timer    |
| Delete tweets          | Implemented   | `DELETE /2/tweets/:id`     |

### Roadmap: Feature Unlock by API Tier

**Basic tier ($200/mo) unlocks:**
- Post tweets with media (images, video, GIFs)
- Thread posting (reply chains)
- Schedule retweets and quote tweets
- Evergreen retweet system
- Engagement builder: like, retweet, reply actions
- Keyword search feed (7-day recent search)
- List member import for engagement builder
- User profile lookup and follower counts
- Basic tweet metrics (likes, retweets via tweet objects)
- Delete/edit scheduled tweets

**Pro tier ($5,000/mo) additionally unlocks:**
- Auto-DM campaigns (1,440 DMs/24hr vs 1/day on Basic)
- Full tweet analytics endpoint
- Full-archive search
- Filtered stream for real-time keyword monitoring
- Webhooks for real-time engagement notifications
- Higher read volume (1M/mo vs 15K/mo)

---

## 7. Key API Flow Diagrams

### Tweet Lifecycle

```
 ┌─────────────────────────────────────────────────────────────┐
 │                    TWEET LIFECYCLE                           │
 │                                                              │
 │  ┌──────────┐     ┌───────────┐     ┌──────────────┐       │
 │  │  COMPOSE  │────>│  SCHEDULE │────>│  PUBLISH     │       │
 │  │           │     │  (our DB) │     │  POST /2/    │       │
 │  │  User     │     │           │     │  tweets      │       │
 │  │  writes   │     │  Store:   │     │              │       │
 │  │  in our   │     │  - text   │     │  Response:   │       │
 │  │  composer │     │  - media  │     │  - tweet_id  │       │
 │  │           │     │  - time   │     │  - text      │       │
 │  │           │     │  - opts   │     │  - created   │       │
 │  └──────────┘     └───────────┘     └──────┬───────┘       │
 │                                             │                │
 │  For threads:                               │                │
 │  POST /2/tweets                             │                │
 │  { text: "Tweet 1" }                        │                │
 │    -> tweet_id_1                            │                │
 │  POST /2/tweets                             │                │
 │  { text: "Tweet 2",                         v                │
 │    reply: { in_reply_to_tweet_id:   ┌──────────────┐        │
 │      tweet_id_1 } }                │  MONITOR     │        │
 │    -> tweet_id_2                    │              │        │
 │  ... repeat for each tweet          │  Poll tweet  │        │
 │      in thread                      │  metrics:    │        │
 │                                     │  - likes     │        │
 │  For media:                         │  - retweets  │        │
 │  1. POST /2/media/upload/initialize │  - replies   │        │
 │  2. POST /2/media/upload/:id/append │  - impressions│       │
 │  3. POST /2/media/upload/:id/finalize│             │        │
 │  4. POST /2/tweets                  └──────┬───────┘        │
 │     { media: { media_ids: [id] } }         │                │
 │                                             │                │
 │                              ┌──────────────┴──────────┐    │
 │                              │                          │    │
 │                              v                          v    │
 │                    ┌──────────────┐          ┌────────────┐ │
 │                    │  AUTOPLUG    │          │  ANALYTICS  │ │
 │                    │              │          │             │ │
 │                    │  If likes >= │          │  Store in   │ │
 │                    │  threshold:  │          │  our DB for │ │
 │                    │  POST reply  │          │  dashboard  │ │
 │                    │  with CTA    │          │             │ │
 │                    └──────────────┘          └────────────┘ │
 │                                                              │
 │  DELETION:                                                   │
 │  DELETE /2/tweets/:id                                        │
 │  (removes from X, update our DB status)                      │
 └─────────────────────────────────────────────────────────────┘
```

### DM Flow (Auto-DM Campaign)

```
 ┌─────────────────────────────────────────────────────────────┐
 │                    AUTO-DM CAMPAIGN FLOW                     │
 │                                                              │
 │  ┌──────────────┐                                           │
 │  │ 1. POST tweet │  "Like + RT + Reply 'YES' for free PDF"  │
 │  │    with CTA   │  POST /2/tweets { text: "..." }          │
 │  └──────┬───────┘                                           │
 │         │                                                    │
 │         v                                                    │
 │  ┌──────────────────────────────────────┐                   │
 │  │ 2. POLL for engagement (every 30min) │                   │
 │  │                                       │                   │
 │  │  GET /2/tweets/:id/liking_users       │                   │
 │  │  GET /2/tweets/:id/retweeted_by       │                   │
 │  │  GET /2/tweets/:id (for reply count)  │                   │
 │  │                                       │                   │
 │  │  For replies with keyword:            │                   │
 │  │  GET /2/tweets/search/recent          │                   │
 │  │  ?query=conversation_id:{tweet_id}    │                   │
 │  └──────────────┬───────────────────────┘                   │
 │                 │                                            │
 │                 v                                            │
 │  ┌──────────────────────────────────────┐                   │
 │  │ 3. CHECK requirements per user        │                   │
 │  │                                       │                   │
 │  │  - Did they like? (check liking_users)│                   │
 │  │  - Did they RT? (check retweeted_by)  │                   │
 │  │  - Did they reply with keyword?       │                   │
 │  │  - Are they a follower? (required     │                   │
 │  │    for DM delivery)                   │                   │
 │  │  - Already sent DM? (check our DB)    │                   │
 │  └──────────────┬───────────────────────┘                   │
 │                 │                                            │
 │                 v                                            │
 │  ┌──────────────────────────────────────┐                   │
 │  │ 4. SEND DMs in batches               │                   │
 │  │                                       │                   │
 │  │  POST /2/dm_conversations/with/       │                   │
 │  │    :participant_id/messages            │                   │
 │  │  { text: "<DM content>                │                   │
 │  │    Reply STOP to opt out" }           │                   │
 │  │                                       │                   │
 │  │  Rate limits:                         │                   │
 │  │  - 15 per 15 min (user)              │                   │
 │  │  - 1,440 per 24hr (user + app)       │                   │
 │  │  - Must pace: ~1 DM per minute       │                   │
 │  └──────────────┬───────────────────────┘                   │
 │                 │                                            │
 │                 v                                            │
 │  ┌──────────────────────────────────────┐                   │
 │  │ 5. CAMPAIGN ends after 3 days         │                   │
 │  │    or manual termination              │                   │
 │  └──────────────────────────────────────┘                   │
 └─────────────────────────────────────────────────────────────┘
```

### Analytics Pipeline

```
 ┌─────────────────────────────────────────────────────────────┐
 │                   ANALYTICS PIPELINE                         │
 │                                                              │
 │  ┌────────────────────────────────────────┐                 │
 │  │  DATA COLLECTION (periodic cron job)    │                 │
 │  │                                         │                 │
 │  │  Every 15 minutes:                      │                 │
 │  │  GET /2/users/:id/tweets                │                 │
 │  │    ?tweet.fields=public_metrics,        │                 │
 │  │     created_at,organic_metrics          │                 │
 │  │    &max_results=100                     │                 │
 │  │                                         │                 │
 │  │  public_metrics returns:                │                 │
 │  │  - retweet_count                        │                 │
 │  │  - reply_count                          │                 │
 │  │  - like_count                           │                 │
 │  │  - quote_count                          │                 │
 │  │  - impression_count                     │                 │
 │  │  - bookmark_count                       │                 │
 │  │                                         │                 │
 │  │  For Pro tier, also:                    │                 │
 │  │  GET /2/tweets/analytics                │                 │
 │  │  (richer engagement data)               │                 │
 │  └───────────────────┬────────────────────┘                 │
 │                      │                                       │
 │                      v                                       │
 │  ┌────────────────────────────────────────┐                 │
 │  │  FOLLOWER TRACKING (daily cron)         │                 │
 │  │                                         │                 │
 │  │  GET /2/users/me                        │                 │
 │  │    ?user.fields=public_metrics          │                 │
 │  │                                         │                 │
 │  │  Returns:                               │                 │
 │  │  - followers_count                      │                 │
 │  │  - following_count                      │                 │
 │  │  - tweet_count                          │                 │
 │  │  - listed_count                         │                 │
 │  │                                         │                 │
 │  │  Store daily snapshot for growth chart  │                 │
 │  └───────────────────┬────────────────────┘                 │
 │                      │                                       │
 │                      v                                       │
 │  ┌────────────────────────────────────────┐                 │
 │  │  OUR DATABASE                           │                 │
 │  │                                         │                 │
 │  │  tweet_analytics table:                 │                 │
 │  │  - tweet_id                             │                 │
 │  │  - snapshot_at                          │                 │
 │  │  - likes, retweets, replies, quotes     │                 │
 │  │  - impressions, bookmarks               │                 │
 │  │  - engagement_rate (computed)            │                 │
 │  │                                         │                 │
 │  │  follower_snapshots table:              │                 │
 │  │  - user_id                              │                 │
 │  │  - snapshot_date                        │                 │
 │  │  - followers_count                      │                 │
 │  │  - following_count                      │                 │
 │  │  - daily_delta (computed)               │                 │
 │  └───────────────────┬────────────────────┘                 │
 │                      │                                       │
 │                      v                                       │
 │  ┌────────────────────────────────────────┐                 │
 │  │  DASHBOARD DISPLAY                      │                 │
 │  │                                         │                 │
 │  │  Charts:                                │                 │
 │  │  - Engagement per tweet (bar)           │                 │
 │  │  - Engagement rate over time (line)     │                 │
 │  │  - Impressions trend (line)             │                 │
 │  │  - Follower growth (line)               │                 │
 │  │  - Daily follower delta (bar)           │                 │
 │  │                                         │                 │
 │  │  Tables:                                │                 │
 │  │  - Top tweets by engagement             │                 │
 │  │  - Sortable by likes/RT/impressions     │                 │
 │  │  - Filter by date range                 │                 │
 │  └────────────────────────────────────────┘                 │
 └─────────────────────────────────────────────────────────────┘
```

---

## 8. Rate Limit Summary for Key Endpoints

### Endpoints We'll Use Most

| Endpoint                                  | Per User/15min | Per App/24hr  | Notes                          |
|------------------------------------------|----------------|---------------|--------------------------------|
| `POST /2/tweets`                          | 100            | 10,000        | Main scheduling endpoint       |
| `DELETE /2/tweets/:id`                    | 50             | -             | Delete scheduled posts         |
| `GET /2/tweets/:id`                       | 900            | -             | Fetch tweet for metrics        |
| `GET /2/users/:id/tweets`                 | 900            | -             | Pull user timeline             |
| `GET /2/tweets/search/recent`             | 300            | -             | Keyword engagement feed        |
| `POST /2/users/:id/likes`                | 50             | -             | Like from engagement builder   |
| `POST /2/users/:id/retweets`             | 50             | -             | Retweet/evergreen              |
| `POST /2/media/upload`                    | 500            | 50,000        | Image uploads                  |
| `POST /2/media/upload/initialize`         | 1,875          | 180,000       | Chunked video upload           |
| `GET /2/users/me`                         | 75             | -             | Auth verification              |
| `POST /2/dm_conversations/.../messages`   | 15             | 1,440         | Auto-DMs (Pro only)            |
| `GET /2/lists/:id/members`                | 900            | -             | List import                    |
| `GET /2/tweets/analytics`                 | 300            | -             | Analytics (Pro only)           |

### Rate Limit Strategy

```
For a user scheduling ~10 tweets/day:
- POST /2/tweets: 10 calls/day (well within 100/15min)
- Media uploads: ~10/day (well within 500/15min)
- Analytics polling: ~96 calls/day (every 15min) = 4/hr
- Follower snapshot: 1 call/day

For engagement builder session (30 min):
- Likes: up to 50 in 15min window
- Retweets: up to 50 in 15min window
- Replies (tweets): up to 100 in 15min window

For auto-DM campaign:
- Max 15 DMs per 15-minute window
- Max 1,440 per 24 hours
- Pacing: 1 DM per minute is safe
- 3-day campaign: max 4,320 DMs total
```

---

## 9. Tweet Object Fields Reference

### Requesting Full Tweet Data

```
GET /2/tweets/:id
  ?tweet.fields=attachments,author_id,context_annotations,
    conversation_id,created_at,edit_controls,edit_history_tweet_ids,
    entities,geo,id,in_reply_to_user_id,lang,
    organic_metrics,possibly_sensitive,
    public_metrics,referenced_tweets,reply_settings,
    source,text,withheld
  &expansions=attachments.media_keys,author_id,
    referenced_tweets.id
  &media.fields=duration_ms,height,media_key,
    preview_image_url,type,url,width,alt_text
  &user.fields=created_at,description,entities,id,
    location,name,profile_image_url,protected,
    public_metrics,url,username,verified
```

### public_metrics Object

```json
{
  "retweet_count": 45,
  "reply_count": 12,
  "like_count": 230,
  "quote_count": 8,
  "impression_count": 15000,
  "bookmark_count": 67
}
```

---

## 10. Implementation Priority

### Phase 1: Core Scheduling (Basic tier)
1. Media upload (images, GIFs, video)
2. Thread posting (chained replies)
3. Schedule retweets
4. Delete scheduled tweets
5. User profile display (`/2/users/me`)

### Phase 2: Engagement & Analytics (Basic tier)
6. Tweet metrics collection via `public_metrics`
7. Follower count tracking
8. Engagement builder: keyword search feed
9. Engagement builder: list member import
10. Like/retweet actions from engagement feed

### Phase 3: Advanced Features (Pro tier required)
11. Auto-DM campaigns
12. Full analytics endpoint
13. Autoplug system (monitor + auto-reply)
14. Evergreen retweet automation
15. Real-time webhook notifications
