# LinkedIn API Reference — Platform Depth

> Reference for `src/platforms/linkedin/` implementation
> Last updated: 2026-04-19

---

## 1. API Products & Access Tiers

| Product | Access | Key Capabilities |
|---|---|---|
| **Share on LinkedIn** | Self-serve (open) | Post creation (text, image, video, article), delete own posts |
| **Sign In with LinkedIn (OpenID)** | Self-serve (open) | Authentication, basic profile (name, photo, email) |
| **Community Management API** | Development + Standard tiers | Comments, reactions, mentions, organization admin, analytics |
| **Advertising API** | Requires approval | Ad campaigns, lead gen, audience targeting |
| **Compliance API** | Partner only | eDiscovery, archival |

### Community Management API Tiers

| Aspect | Development | Standard |
|---|---|---|
| **Access** | Self-serve (instant) | Application review required |
| **App rate limit** | 500 requests/day | 500 requests/day (same) |
| **Member rate limit** | 100 requests/day | 100 requests/day (same) |
| **Organization admin** | Yes (limited) | Yes (full) |
| **Analytics** | Basic | Full (follower, page, share stats) |
| **Approval process** | None | Screencast video demo + review form |

**Critical note:** Standard tier requires submitting a screencast video demonstrating the app's integration. Review takes 2-4 weeks.

---

## 2. OAuth 2.0 Flow

### 2A. 3-Legged OAuth 2.0 Authorization Code Flow

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Our App     │    │ LinkedIn │
│ Browser  │    │  Backend     │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  LinkedIn       │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Redirect to    │                 │
     │  linkedin.com/  │                 │
     │  oauth/v2/      │                 │
     │  authorization  │                 │
     │<────────────────│                 │
     │                 │                 │
     │  User logs in   │                 │
     │  + authorizes   │                 │
     │  scopes         │                 │
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
     │                 │  v2/accessToken │
     │                 │  {code, client_ │
     │                 │   id, secret,   │
     │                 │   redirect_uri} │
     │                 │────────────────>│
     │                 │                 │
     │                 │  {access_token, │
     │                 │   expires_in,   │
     │                 │   refresh_token,│
     │                 │   scope}        │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Token details:
- access_token: 60-day lifetime
- refresh_token: 365-day lifetime (use before expiry)
- Token refresh: POST /oauth/v2/accessToken with grant_type=refresh_token
```

### 2B. Authorization URL

```
GET https://www.linkedin.com/oauth/v2/authorization
  ?response_type=code
  &client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &state={CSRF_TOKEN}
  &scope={SPACE_SEPARATED_SCOPES}
```

### 2C. Token Exchange

```
POST https://www.linkedin.com/oauth/v2/accessToken
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={AUTH_CODE}
&client_id={CLIENT_ID}
&client_secret={CLIENT_SECRET}
&redirect_uri={REDIRECT_URI}
```

### 2D. Token Refresh

```
POST https://www.linkedin.com/oauth/v2/accessToken
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={REFRESH_TOKEN}
&client_id={CLIENT_ID}
&client_secret={CLIENT_SECRET}
```

---

## 3. Scopes & Permissions

| Scope | Description | Product Required |
|---|---|---|
| `openid` | OpenID Connect authentication | Sign In with LinkedIn |
| `profile` | Name, photo, headline | Sign In with LinkedIn |
| `email` | Primary email address | Sign In with LinkedIn |
| `w_member_social` | Create/delete posts on behalf of member | Share on LinkedIn |
| `r_organization_social` | Read org posts, comments, reactions | Community Management |
| `w_organization_social` | Create/delete org posts, comments | Community Management |
| `r_organization_admin` | Read org admin data (followers, page stats) | Community Management |
| `rw_organization_admin` | Manage organization settings | Community Management, request only when needed |
| `r_1st_connections_size` | Count of 1st-degree connections | Community Management |
| `r_ads` | Read ad accounts and campaigns | Advertising API |
| `rw_ads` | Manage ad campaigns | Advertising API |
| `r_member_social` | **CLOSED** — Read member's social activity | Not accepting requests |

**Important:** `r_member_social` is permanently closed to new applications. Cannot read member feed or engagement history. The native connection flow uses app-managed OAuth credentials from server env and requests OpenID scopes for profile lookup, so users approve access without pasting LinkedIn app keys.

### Scope Sets by Feature

| Feature | Required Scopes |
|---|---|
| Connect profile + identify member | `openid`, `profile`, `email` |
| Post as member | `openid`, `profile`, `email`, `w_member_social` |
| Post as organization | `openid`, `profile`, `email`, `w_member_social`, `w_organization_social`, `r_organization_admin` |
| Read org comments/reactions | `r_organization_social` |
| Org follower analytics | `r_organization_admin` |
| Full org management | `rw_organization_admin`, `r_organization_social`, `w_organization_social` |

---

## 4. API Capabilities Matrix

### 4A. Posting (Posts API)

| Endpoint | Method | Description | Rate Limit |
|---|---|---|---|
| `/rest/posts` | POST | Create post (text, image, video, article, poll) | 100/day per member |
| `/rest/posts/{id}` | GET | Retrieve single post | Standard |
| `/rest/posts/{id}` | DELETE | Delete own post | Standard |
| `/rest/images` | POST | Register image upload | Standard |
| `/rest/videos` | POST | Initialize video upload | Standard |

**Post types supported:**
- Text-only posts
- Single image + text
- Multi-image (up to 20 images via `CAROUSEL`)
- Video + text (upload via `registerUpload` → PUT binary)
- Article share (URL with optional commentary)
- Poll (2-4 options, 1-14 day duration)
- Document/PDF posts (native carousel documents)

**Post creation payload:**
```json
{
  "author": "urn:li:person:{MEMBER_ID}",
  "commentary": "Post text here",
  "visibility": "PUBLIC",
  "distribution": {
    "feedDistribution": "MAIN_FEED",
    "targetEntities": [],
    "thirdPartyDistributionChannels": []
  },
  "lifecycleState": "PUBLISHED",
  "isReshareDisabledByAuthor": false
}
```

**Image upload flow:**
```
1. POST /rest/images  →  { uploadUrl, image_urn }
2. PUT {uploadUrl} with binary image data
3. Include image_urn in post content
```

**Video upload flow:**
```
1. POST /rest/videos (initializeUploadRequest)
   →  { uploadUrl, video_urn, uploadInstructions[] }
2. PUT each chunk to uploadInstructions[].uploadUrl
3. POST /rest/videos (finalizeUploadRequest) with video_urn
4. Include video_urn in post content
```

### 4B. Comments API

| Endpoint | Method | Description | Auth |
|---|---|---|---|
| `/rest/socialActions/{postUrn}/comments` | GET | List comments on post | `r_organization_social` |
| `/rest/socialActions/{postUrn}/comments` | POST | Create comment | `w_organization_social` |
| `/rest/socialActions/{postUrn}/comments/{id}` | DELETE | Delete comment | `w_organization_social` |

**Comment payload:**
```json
{
  "actor": "urn:li:organization:{ORG_ID}",
  "message": {
    "text": "Reply text here"
  }
}
```

### 4C. Reactions API

| Endpoint | Method | Description |
|---|---|---|
| `/rest/reactions/{postUrn}` | GET | List reactions (LIKE, CELEBRATE, SUPPORT, LOVE, INSIGHTFUL, FUNNY) |
| `/rest/reactions` | POST | Create reaction |
| `/rest/reactions/{reactionUrn}` | DELETE | Remove reaction |

### 4D. Social Metadata

| Endpoint | Method | Description |
|---|---|---|
| `/rest/socialMetadata/{postUrn}` | GET | Get like/comment/share counts for a post |

### 4E. Organization Analytics

| Endpoint | Method | Metrics | Scope |
|---|---|---|---|
| `/rest/organizationalEntityFollowerStatistics` | GET | Follower count, demographics, growth | `r_organization_admin` |
| `/rest/organizationPageStatistics` | GET | Page views by section (overview, jobs, etc.) | `r_organization_admin` |
| `/rest/organizationalEntityShareStatistics` | GET | Post impressions, clicks, engagement, shares | `r_organization_admin` |
| `/rest/videoAnalytics` | GET | Video views, completion rate, unique viewers | `r_organization_admin` |

**Follower statistics query:**
```
GET /rest/organizationalEntityFollowerStatistics
  ?q=organizationalEntity
  &organizationalEntity=urn:li:organization:{ORG_ID}
  &timeIntervals.timeGranularityType=DAY
  &timeIntervals.timeRange.start=1609459200000
  &timeIntervals.timeRange.end=1612137600000
```

**Share statistics query:**
```
GET /rest/organizationalEntityShareStatistics
  ?q=organizationalEntity
  &organizationalEntity=urn:li:organization:{ORG_ID}
  &shares[0]=urn:li:share:{SHARE_ID}
```

### 4F. Mentions & Notifications

| Endpoint | Method | Description |
|---|---|---|
| `/rest/socialActions/{postUrn}/comments` | GET (filtered) | Find @mentions of org in comments |
| Organization notifications webhook | — | Not available via API (poll-based only) |

---

## 5. Rate Limits

| Category | Limit | Window |
|---|---|---|
| **Application-level** | 500 requests/day | 24 hours (UTC reset) |
| **Member-level** | 100 requests/day | 24 hours (UTC reset) |
| **Post creation** | 100 posts/day per member | 24 hours |
| **Comment creation** | Included in app limit | — |
| **Image uploads** | Included in app limit | — |
| **Throttle response** | HTTP 429 | Retry after `Retry-After` header |

**Rate limit headers:**
```
X-Li-Throttle-Action: THROTTLED | RATE_LIMITED
X-Li-Throttle-Type: APPLICATION | MEMBER
Retry-After: {seconds}
```

**Strategy:** With 500 requests/day app-wide, must budget carefully:
- Post creation: ~2-5 requests per post (create + media upload)
- Analytics polling: batch queries, poll 1-2x/day max
- Comment monitoring: poll every 15-30 min for active orgs

---

## 6. Current State vs What's Possible

| Capability | Current (`linkedin-personal.ts` / `linkedin-company.ts`) | API Supports | Gap |
|---|---|---|---|
| **Personal posting** | Text + image | Text, image, video, article, poll, carousel | Missing video, poll, carousel |
| **Company posting** | Text + image | Same as personal + org analytics | Missing video, poll, carousel |
| **Comments** | Not implemented | Full CRUD on org posts | Full gap |
| **Reactions** | Not implemented | Create/list/delete reactions | Full gap |
| **Analytics** | Not implemented | Follower, page, share, video stats | Full gap |
| **Mentions** | Not implemented | Read @mentions via comment scanning | Full gap |
| **DMs** | Not possible | LinkedIn Messaging API = partner-only | Blocked |
| **Webhooks** | Not possible | No webhook support (poll only) | Blocked |

---

## 7. Implementation Priority

### Phase 1: Enhance Posting (Low effort, high value)
- Add video upload support (initialize → chunk → finalize → post)
- Add poll creation (2-4 options with duration)
- Add document/carousel post support
- Add article sharing with commentary
- Estimate: 2-3 days

### Phase 2: Comments & Reactions (Medium effort, high value)
- Implement comment listing on org posts
- Implement comment creation (reply as org)
- Implement reaction listing and creation
- Requires: `r_organization_social` + `w_organization_social`
- Estimate: 2 days

### Phase 3: Analytics (Medium effort, high value)
- Follower statistics (count, demographics, growth)
- Share statistics (per-post impressions, clicks, engagement)
- Page statistics (views by section)
- Video analytics (views, completion rate)
- Requires: `r_organization_admin`
- Requires: Standard tier approval for full analytics
- Estimate: 3 days

### Phase 4: Engagement Monitoring (Medium effort, medium value)
- Poll comments for @mentions
- Surface new comments on org posts
- Basic notification feed via polling
- Estimate: 2 days

### Not Feasible
- **DMs:** LinkedIn Messaging API is partner-only (CRM/recruiting platforms)
- **Webhooks:** No real-time notification API exists; must poll
- **Member feed reading:** `r_member_social` scope is closed permanently

---

## 8. Key Constraints & Gotchas

1. **500 requests/day is brutal** — Must cache aggressively and batch analytics calls
2. **Standard tier requires video demo** — Plan 2-4 weeks for approval
3. **Org posting requires admin** — Connected member must be org admin
4. **No member social read** — Cannot read member's feed, timeline, or engagement history
5. **URN format everywhere** — All entities use `urn:li:person:{id}` / `urn:li:organization:{id}` format
6. **REST API versioning** — Must include `LinkedIn-Version: 202401` header (YYYYMM format)
7. **Media upload is multi-step** — Register → upload binary → reference in post (not single-step)
8. **Carousel = multi-image** — Uses LinkedIn's native carousel format, not Article type
9. **Poll duration** — 1 to 14 days, cannot be edited after creation
10. **60-day access tokens** — Must implement proactive refresh before expiry
