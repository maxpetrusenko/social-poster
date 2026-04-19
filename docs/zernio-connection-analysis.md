# Zernio Connection & Auth Flow Analysis

> Crawled from https://zernio.com/dashboard + https://docs.zernio.com on 2026-04-17

---

## 1. Platform Connection Matrix (Zernio)

| Platform | Auth Method | Secondary Selection | Token Expiry | Analytics |
|---|---|---|---|---|
| **Twitter/X** | OAuth 2.0 | None | Yes | Yes |
| **Instagram** | OAuth 2.0 (via Facebook) | None (auto via FB page) | 60 days | Yes |
| **Facebook** | OAuth 2.0 | Select Page | 60 days | Yes |
| **LinkedIn** | OAuth 2.0 | Select Org or Personal | 60 days | Yes |
| **TikTok** | OAuth 2.0 | None | Yes | Yes |
| **YouTube** | OAuth 2.0 (Google) | None | Yes | Yes |
| **Pinterest** | OAuth 2.0 | Select Board | Yes | Yes |
| **Reddit** | OAuth 2.0 | Select Subreddit | Yes | Limited |
| **Threads** | OAuth 2.0 | None | Yes | Yes |
| **Google Business** | OAuth 2.0 (Google) | Select Location | Yes | Yes |
| **Snapchat** | OAuth 2.0 | Select Public Profile | Yes | Yes |
| **Bluesky** | App Password (credentials) | None | No expiry | Limited |
| **Telegram** | Bot Token (access code) | None | No expiry | No |
| **WhatsApp** | Redirect / Credentials (Meta) | Select Phone Number | No expiry | No |
| **Discord** | OAuth 2.0 (Bot) | None | No expiry | No |

---

## 2. Auth Flow Diagrams

### 2A. Standard OAuth 2.0 Flow (Most Platforms)

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  User    │    │  Your App    │    │  Zernio API │    │ Platform │
│ Browser  │    │  (Backend)   │    │             │    │ (FB/LI)  │
└────┬─────┘    └──────┬───────┘    └──────┬──────┘    └────┬─────┘
     │                 │                   │                │
     │  Click Connect  │                   │                │
     │────────────────>│                   │                │
     │                 │                   │                │
     │                 │ GET /v1/connect/  │                │
     │                 │ {platform}        │                │
     │                 │  ?profileId=X     │                │
     │                 │  &redirect_url=Y  │                │
     │                 │──────────────────>│                │
     │                 │                   │                │
     │                 │  { authUrl, state }│                │
     │                 │<──────────────────│                │
     │                 │                   │                │
     │  302 Redirect   │                   │                │
     │  to authUrl     │                   │                │
     │<────────────────│                   │                │
     │                 │                   │                │
     │  User authorizes on platform        │                │
     │─────────────────────────────────────────────────────>│
     │                 │                   │                │
     │  Redirect back with ?code=...       │                │
     │<─────────────────────────────────────────────────────│
     │                 │                   │                │
     │  Zernio handles │token exchange     │                │
     │  (standard mode)│                   │                │
     │─────────────────────────────────────>│                │
     │                 │                   │ Exchange code  │
     │                 │                   │───────────────>│
     │                 │                   │  access_token  │
     │                 │                   │<───────────────│
     │                 │                   │                │
     │  302 to redirect_url               │                │
     │  ?connected=platform               │                │
     │  &accountId=Y                      │                │
     │<────────────────────────────────────│                │
     │                 │                   │                │
```

### 2B. Headless OAuth Flow (Custom UI)

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  User    │    │  Your App    │    │  Zernio API │    │ Platform │
└────┬─────┘    └──────┬───────┘    └──────┬──────┘    └────┬─────┘
     │                 │                   │                │
     │                 │ GET /v1/connect/  │                │
     │                 │ facebook          │                │
     │                 │  ?headless=true   │                │
     │                 │──────────────────>│                │
     │                 │  { authUrl }      │                │
     │                 │<──────────────────│                │
     │                 │                   │                │
     │  Redirect to FB │                   │                │
     │<────────────────│                   │                │
     │  ... user authorizes ...            │                │
     │                 │                   │                │
     │  Redirect to YOUR app              │                │
     │  ?connect_token=CT123 (15min TTL)  │                │
     │────────────────>│                   │                │
     │                 │                   │                │
     │                 │ GET /v1/connect/  │                │
     │                 │ facebook/pages    │                │
     │                 │ X-Connect-Token:  │                │
     │                 │ CT123             │                │
     │                 │──────────────────>│                │
     │                 │  { pages: [...] } │                │
     │                 │<──────────────────│                │
     │                 │                   │                │
     │  Show page      │                   │                │
     │  picker UI      │                   │                │
     │<────────────────│                   │                │
     │  User picks     │                   │                │
     │  page           │                   │                │
     │────────────────>│                   │                │
     │                 │                   │                │
     │                 │ POST /v1/connect/ │                │
     │                 │ facebook/page     │                │
     │                 │ { pageId: "123" } │                │
     │                 │──────────────────>│                │
     │                 │  { account }      │                │
     │                 │<──────────────────│                │
     │  Connected!     │                   │                │
     │<────────────────│                   │                │
```

### 2C. Non-OAuth: Bluesky (App Password)

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  User    │    │  Your App    │    │  Zernio API │    │ Bluesky  │
└────┬─────┘    └──────┬───────┘    └──────┬──────┘    └────┬─────┘
     │                 │                   │                │
     │  Enter handle + │                   │                │
     │  app password   │                   │                │
     │────────────────>│                   │                │
     │                 │                   │                │
     │                 │ POST /v1/connect/ │                │
     │                 │ bluesky/          │                │
     │                 │ credentials       │                │
     │                 │ { identifier,     │                │
     │                 │   password }      │                │
     │                 │──────────────────>│                │
     │                 │                   │ Create session │
     │                 │                   │───────────────>│
     │                 │                   │  { session }   │
     │                 │                   │<───────────────│
     │                 │  { account }      │                │
     │                 │<──────────────────│                │
     │  Connected!     │                   │                │
     │<────────────────│                   │                │
```

### 2D. Non-OAuth: Telegram (Bot Token + Access Code)

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  User    │    │  Your App    │    │  Zernio API │    │ Telegram │
└────┬─────┘    └──────┬───────┘    └──────┬──────┘    └────┬─────┘
     │                 │                   │                │
     │  Click Connect  │                   │                │
     │────────────────>│                   │                │
     │                 │ POST /v1/connect/ │                │
     │                 │ telegram          │                │
     │                 │──────────────────>│                │
     │                 │ { accessCode:     │                │
     │                 │   "ABC123" }      │                │
     │                 │<──────────────────│                │
     │                 │                   │                │
     │  Show code      │                   │                │
     │  "Send ABC123   │                   │                │
     │   to @ZernioBot"│                   │                │
     │<────────────────│                   │                │
     │                 │                   │                │
     │  User sends code to bot on Telegram │                │
     │─────────────────────────────────────────────────────>│
     │                 │                   │                │
     │                 │ GET /v1/connect/  │                │
     │                 │ telegram (poll)   │                │
     │                 │──────────────────>│                │
     │                 │ { status:         │                │
     │                 │   "connected" }   │                │
     │                 │<──────────────────│                │
     │  Connected!     │                   │                │
     │<────────────────│                   │                │
```

### 2E. WhatsApp (Meta Embedded Signup)

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  User    │    │  Your App    │    │  Zernio API │    │   Meta   │
└────┬─────┘    └──────┬───────┘    └──────┬──────┘    └────┬─────┘
     │                 │                   │                │
     │  Start WhatsApp │                   │                │
     │  connection     │                   │                │
     │────────────────>│                   │                │
     │                 │                   │                │
     │  Meta Embedded Signup redirect      │                │
     │  (choose number type, verify)       │                │
     │─────────────────────────────────────────────────────>│
     │                 │                   │                │
     │  Auto-verify phone number           │                │
     │<─────────────────────────────────────────────────────│
     │                 │                   │                │
     │  Continue to Meta Business registration              │
     │─────────────────────────────────────────────────────>│
     │                 │                   │                │
     │  Redirect with credentials          │                │
     │<────────────────────────────────────│                │
     │                 │                   │                │
     │                 │ POST /v1/connect/ │                │
     │                 │ whatsapp/         │                │
     │                 │ credentials       │                │
     │                 │──────────────────>│                │
     │                 │  { account }      │                │
     │                 │<──────────────────│                │
     │  Connected!     │                   │                │
     │<────────────────│                   │                │
```

---

## 3. Permissions Required Per Platform

### Facebook (OAuth 2.0)
- **Posting:** `pages_manage_posts`, `pages_read_engagement`
- **Analytics:** `pages_read_engagement`, `read_insights`
- **Optional:** `pages_show_list`, `pages_manage_engagement`, `pages_read_user_content`, `business_management`, `pages_messaging`, `pages_manage_metadata`
- **Note:** Requires Facebook App Review for production

### Instagram (OAuth 2.0 via Facebook)
- **Posting:** `instagram_business_basic`, `instagram_business_content_publish`
- **Analytics:** `instagram_business_manage_insights`
- **Optional:** `instagram_business_manage_comments`, `instagram_business_manage_messages`
- **Note:** Must be Business/Creator account linked to FB Page

### LinkedIn (OAuth 2.0)
- **Posting:** `w_member_social`
- **Analytics:** `r_member_postAnalytics`, `r_member_profileAnalytics`, `r_organization_social`, `r_organization_followers`
- **Optional:** `openid`, `profile`, `r_basicprofile`, `email`, `w_member_social_feed`, `r_1st_connections_size`, `w_organization_social`, `w_organization_social_feed`, `r_organization_admin`, `r_organization_social_feed`, `r_ads`, `rw_ads`, `r_ads_reporting`

### Twitter/X (OAuth 2.0)
- **Scopes:** `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- **DMs:** `dm.read`, `dm.write`
- **Note:** OAuth 1.0a for some legacy features

### TikTok (OAuth 2.0)
- **Posting:** `video.upload`, `video.publish`
- **Analytics:** `video.list`
- **Note:** Requires TikTok Developer Portal app approval

### YouTube (OAuth 2.0 / Google)
- **Scopes:** `youtube.upload`, `youtube.readonly`, `youtube.force-ssl`
- **Note:** Google Cloud Console project required

### Pinterest (OAuth 2.0)
- **Scopes:** `boards:read`, `pins:read`, `pins:write`
- **Secondary:** Must select board after OAuth

### Reddit (OAuth 2.0)
- **Scopes:** `submit`, `read`, `identity`, `flair`
- **Secondary:** Must select subreddit

### Bluesky (App Password - NOT OAuth)
- **Auth:** Handle + App Password (no OAuth)
- **Flow:** Direct credential POST
- **No expiry** on app passwords

### Telegram (Bot Token - NOT OAuth)
- **Auth:** Access code sent to Zernio bot
- **Flow:** Initiate -> Get code -> User sends to bot -> Poll status
- **No expiry**

### Discord (OAuth 2.0 Bot)
- **Scopes:** Bot permissions (send messages, embed links, etc.)
- **Note:** Bot token based

### WhatsApp (Meta Embedded Signup)
- **Auth:** Redirect to Meta for business verification + phone number
- **Flow:** Embedded signup -> phone verify -> credentials
- **Note:** Requires Meta Business account, WhatsApp Business API

### Google Business (OAuth 2.0 / Google)
- **Scopes:** `business.manage`
- **Secondary:** Select location after OAuth

### Snapchat (OAuth 2.0)
- **Secondary:** Select Public Profile after OAuth
- **Note:** Requires Public Profile to publish

---

## 4. What We Already Have (social-poster codebase)

### Implemented Providers (with OAuth)
| Provider | File | Status |
|---|---|---|
| Twitter/X | `src/lib/providers/twitter.ts` | Has OAuth 2.0 |
| Facebook | `src/lib/providers/facebook.ts` | Has OAuth 2.0 |
| Instagram | `src/lib/providers/instagram.ts` | Has OAuth 2.0 (via FB) |
| Instagram Personal | `src/lib/providers/instagram-personal.ts` | Has OAuth |
| LinkedIn Personal | `src/lib/providers/linkedin-personal.ts` | Has OAuth 2.0 |
| LinkedIn Company | `src/lib/providers/linkedin-company.ts` | Has OAuth 2.0 |
| Threads | `src/lib/providers/threads.ts` | Has OAuth 2.0 |
| YouTube | `src/lib/providers/youtube.ts` | Has OAuth 2.0 |
| Google Business | `src/lib/providers/google-business.ts` | Has OAuth 2.0 |
| Pinterest | `src/lib/providers/pinterest.ts` | Has OAuth 2.0 |
| TikTok | `src/lib/providers/tiktok.ts` | Has OAuth 2.0 |
| Mastodon | `src/lib/providers/mastodon.ts` | Has OAuth 2.0 |
| Bluesky | `src/lib/providers/bluesky.ts` | Has credentials |

### Missing Providers (compared to Zernio)
- **Reddit** - Not implemented
- **Telegram** - Not implemented
- **Discord** - Not implemented
- **WhatsApp** - Not implemented
- **Snapchat** - Not implemented

### Infrastructure We Have
- OAuth state management: `src/lib/providers/oauth-state.ts`
- OAuth callback handler: `src/lib/providers/oauth-callback.ts`
- Provider registry: `src/lib/providers/registry.ts`
- Connection catalog UI: `src/lib/connection-catalog.ts`
- Dynamic routes: `src/app/api/auth/[platform]/route.ts` + `/callback/route.ts`
- Native publisher: `src/lib/providers/native-publisher.ts`

---

## 5. Cookie-Based Onboarding Strategy

For easier onboarding (grabbing cookies from user's browser):

### Platforms Where Cookies Could Help
| Platform | Cookie Strategy | Feasibility |
|---|---|---|
| Twitter/X | Session cookies (`auth_token`, `ct0`) | Medium - changes frequently, risk of ban |
| Instagram | Session cookies (`sessionid`, `csrftoken`) | Low - Meta detects, high ban risk |
| Facebook | Session cookies (`c_user`, `xs`) | Low - heavily monitored |
| LinkedIn | Session cookies (`li_at`, `JSESSIONID`) | Medium - used by many tools |
| Reddit | Session cookies | Medium - less monitored |
| TikTok | Session cookies (`sessionid`) | Low - heavily protected |
| YouTube | Google cookies | Very Low - Google detects immediately |

### Recommendation
**Cookie-based auth is NOT recommended** for production use:
1. Violates platform ToS universally
2. Sessions expire unpredictably
3. Platforms actively detect and ban automated cookie usage
4. No API access - limited to scraping-style interactions
5. Legal liability

**Better approach:** Use OAuth 2.0 (already implemented) or Zernio API as intermediary.

### For Analytics-Only (Read) Use Cases
If you need analytics without full OAuth (for quick onboarding demo):
- **Zernio API** handles all token management - use their `/v1/analytics/*` endpoints
- Cost: $10-50/mo depending on plan
- They already have all permissions wired up

---

## 6. Zernio vs Direct Implementation Decision Matrix

| Factor | Use Zernio API | Build Direct |
|---|---|---|
| **Speed to market** | Fast (API calls only) | Slow (each platform's dev portal) |
| **App review** | Not needed (they handle it) | Needed per platform |
| **Token refresh** | Automatic | Must implement per platform |
| **Cost** | $10-50/mo + per-post costs | Free (your own API keys) |
| **Control** | Limited to their API | Full control |
| **Cookie/session scraping** | Not supported | Possible but risky |
| **Platforms** | 15 platforms | Whatever you build |
| **Analytics** | Unified API | Build per-platform |

### Hybrid Approach (Recommended)
1. **Direct OAuth** for platforms you already have (Twitter, FB, IG, LinkedIn, etc.)
2. **Zernio API** for platforms you're missing (Reddit, Telegram, Discord, WhatsApp, Snapchat)
3. **Zernio API** for unified analytics across all platforms
4. **Never** use cookie scraping for production users

---

## 7. Connection Flow for Our App (social-poster)

### Current Flow
```
User -> Dashboard -> Connect Platform -> OAuth redirect
  -> Platform auth screen -> Callback to our app
  -> Store tokens in Supabase `platforms` table
  -> Ready to post via native-publisher.ts
```

### Enhanced Flow (with Zernio for missing platforms)
```
User -> Dashboard -> Connect Platform
  |
  ├─ [Direct OAuth - existing providers]
  |   -> /api/auth/{platform} -> OAuth redirect
  |   -> Platform auth -> Callback -> Store tokens
  |   -> Post via native-publisher.ts
  |
  └─ [Zernio API - Reddit/Telegram/Discord/WhatsApp/Snapchat]
      -> GET zernio.com/api/v1/connect/{platform}
      -> Get authUrl -> Redirect user
      -> Callback with accountId
      -> Store Zernio accountId in our DB
      -> Post via Zernio POST /v1/posts
```

---

## 8. Implementation Priority

| Priority | Platform | Auth Type | Effort | Notes |
|---|---|---|---|---|
| 1 | Reddit | OAuth 2.0 | Low | Standard OAuth, we have infra |
| 2 | Discord | OAuth 2.0 (Bot) | Low | Standard OAuth + bot setup |
| 3 | Telegram | Bot Token | Medium | Custom flow (access code + polling) |
| 4 | WhatsApp | Meta Signup | High | Meta Business verification required |
| 5 | Snapchat | OAuth 2.0 | Medium | Requires app approval + public profile selection |
