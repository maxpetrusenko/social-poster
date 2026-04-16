# Handoff: Port Native Social Providers to Social-Poster

## Goal

Add native (direct API) social provider implementations to social-poster, ported from brightbean-studio's Python providers into TypeScript. Keep the existing Late/Bird proxy path as a second connection tab. Each platform gets **two connection modes**:

1. **Native (Direct)** — OAuth2 flow + direct API calls (new)
2. **Proxy (Late/Bird)** — existing relay through getlate.dev / Bird CLI (keep as-is)

---

## Architecture Overview

### Source (brightbean-studio — Python)
- `providers/base.py` — abstract `SocialProvider` base class with `_request()` helper, abstract methods for auth, profile, publish, analytics, inbox
- `providers/types.py` — shared dataclasses: `OAuthTokens`, `AccountProfile`, `PublishResult`, `PublishContent`, `PostType`, `MediaType`, `AuthType`, etc.
- `providers/exceptions.py` — `ProviderError`, `OAuthError`, `TokenExpiredError`, `RateLimitError`, `PublishError`, `APIError`
- `providers/__init__.py` — registry mapping platform string → provider class, `get_provider()` factory
- 13 provider files: facebook, instagram, instagram_personal, linkedin, linkedin_personal, linkedin_company, tiktok, youtube, pinterest, threads, bluesky, google_business, mastodon

### Target (social-poster — TypeScript/Next.js)
Current publishing lives in `src/lib/pipeline/`:
- `publish-service.ts` — dispatches to `publishToLate()` or `publishToBird()`
- `publisher.ts` — Late API client
- `bird-publisher.ts` — Bird CLI wrapper for X/Twitter

---

## Implementation Plan

### Phase 1: Core Provider Framework (TypeScript)

Create `src/lib/providers/` directory:

```
src/lib/providers/
  types.ts          — port types.py (enums, interfaces)
  errors.ts         — port exceptions.py
  base.ts           — port base.py (abstract class or interface + helpers)
  registry.ts       — port __init__.py (provider map + getProvider())
  facebook.ts
  instagram.ts
  instagram-personal.ts
  linkedin.ts
  linkedin-personal.ts
  linkedin-company.ts
  tiktok.ts
  youtube.ts
  pinterest.ts
  threads.ts
  bluesky.ts
  google-business.ts
  mastodon.ts
```

#### types.ts
Port from `providers/types.py`:
```typescript
// Enums
export type PostType = "text" | "image" | "video" | "carousel" | "story" | "reel" | "link" | "article" | "poll" | "pin" | "short";
export type MediaType = "jpeg" | "png" | "gif" | "mp4" | "mov" | "webp" | "pdf";
export type AuthType = "oauth2" | "session" | "instance_oauth";

// Interfaces
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  raw?: Record<string, unknown>;
}

export interface AccountProfile {
  platformId: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  followerCount?: number;
  extra?: Record<string, unknown>;
}

export interface PublishContent {
  text: string;
  mediaUrls?: string[];
  mediaFiles?: string[];   // local file paths
  postType?: PostType;
  linkUrl?: string;
  title?: string;
  description?: string;
  firstComment?: string;
  extra?: Record<string, unknown>;
}

export interface PublishResult {
  platformPostId: string;
  url?: string;
  extra?: Record<string, unknown>;
}
```

#### base.ts
Port from `providers/base.py`. Key pattern — each provider implements:
- `platformName`, `authType`, `maxCaptionLength`, `supportedPostTypes`, `supportedMediaTypes`, `requiredScopes`
- `getAuthUrl(redirectUri, state)` → string
- `exchangeCode(code, redirectUri)` → OAuthTokens
- `refreshToken(refreshToken)` → OAuthTokens
- `getProfile(accessToken)` → AccountProfile
- `publishPost(accessToken, content)` → PublishResult

The base class has a `_request()` helper that wraps `fetch()` with:
- Auto Bearer token header
- 429 → RateLimitError
- 4xx/5xx → APIError
- 30s default timeout

#### registry.ts
```typescript
import { FacebookProvider } from "./facebook";
// ... all imports
export const PROVIDER_REGISTRY: Record<string, new (creds: Record<string, string>) => SocialProvider> = {
  facebook: FacebookProvider,
  instagram: InstagramProvider,
  // ...
};
export function getProvider(platform: string, credentials: Record<string, string>) { ... }
```

### Phase 2: Port Each Provider

For each provider, port the Python class to TypeScript. The core methods to port are:

1. `getAuthUrl()` — build OAuth URL with scopes
2. `exchangeCode()` — POST to token endpoint
3. `refreshToken()` — POST to refresh endpoint
4. `getProfile()` — GET user/account info
5. `publishPost()` — the main publish flow (text, image, video, carousel)

**Reference the brightbean-studio source files directly** — each provider file is 350-750 lines of Python with all the API URLs, scopes, and logic.

### Phase 3: Wire Into publish-service.ts

Update `publishPlatformTargets()` in `src/lib/pipeline/publish-service.ts`:

```typescript
// Current: Late or Bird only
// New: add native provider path

if (platform.provider === "direct" && hasNativeProvider(platform.type)) {
  // NEW: use native provider
  result = await publishViaNativeProvider(target);
} else if (shouldPublishViaBird(platform)) {
  result = await publishToBird(target);
} else {
  // existing Late proxy path
  result = await publishToLate([target]);
}
```

### Phase 4: OAuth Callback Routes

Create API routes for OAuth flows:

```
src/app/api/auth/[platform]/route.ts      — initiate OAuth (redirect to provider)
src/app/api/auth/[platform]/callback/route.ts — handle callback, exchange code, store tokens
```

Store tokens in `platforms.config` JSON field:
```json
{
  "credentials": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890
  }
}
```

### Phase 5: Update Connection Catalog

Update `src/lib/connection-catalog.ts` to add native connection methods alongside existing proxy methods. Each platform gets a second tab/method:

```typescript
// Example for Instagram:
{
  id: "instagram_native",
  label: "Connect with Meta (Direct)",
  provider: "direct",
  authType: "oauth",   // new field — triggers OAuth flow instead of manual fields
  fields: [],           // no manual fields needed — OAuth handles it
  docs: "https://developers.facebook.com/docs/instagram-api"
},
{
  id: "instagram_relay",
  label: "Connect via Late (Proxy)",
  provider: "zernio",
  fields: [ /* existing Late fields */ ]
}
```

### Phase 6: Add Missing Platforms

Add these to `src/lib/platforms.ts` PLATFORM_TYPES:
- `threads`
- `bluesky`
- `google_business`
- `mastodon`
- `instagram_personal` (variant)

Update the DB schema if needed (platform type enum validation).

---

## Developer Apps & API Keys Required Per Platform

### Facebook + Instagram (same Meta app)
- **Dev Portal:** https://developers.facebook.com/apps
- **Create:** "Business" type app
- **Products to add:** Facebook Login, Instagram Graph API
- **Env vars needed:**
  ```
  META_APP_ID=...
  META_APP_SECRET=...
  ```
- **OAuth scopes (Facebook):** `business_management`, `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_messaging`
- **OAuth scopes (Instagram via Meta):** `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`
- **Callback URL to register:** `{APP_URL}/api/auth/facebook/callback` and `{APP_URL}/api/auth/instagram/callback`
- **Note:** Requires App Review for production. Test mode works with app admins/testers only.

### Instagram Personal (separate API)
- **Dev Portal:** Same Meta app, but uses Instagram Basic Display API
- **Env vars:** Same `META_APP_ID` / `META_APP_SECRET`
- **OAuth scopes:** `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`
- **Auth URL:** `https://api.instagram.com/oauth/authorize` (different from Meta OAuth!)
- **Callback:** `{APP_URL}/api/auth/instagram-personal/callback`

### LinkedIn
- **Dev Portal:** https://www.linkedin.com/developers/apps
- **Create:** Company app (needs a LinkedIn Company Page to associate)
- **Products to request:** "Share on LinkedIn", "Sign In with LinkedIn using OpenID Connect"
- **Env vars:**
  ```
  LINKEDIN_CLIENT_ID=...
  LINKEDIN_CLIENT_SECRET=...
  ```
- **OAuth scopes (personal):** `r_basicprofile`, `w_member_social`, `r_member_social`
- **OAuth scopes (company):** `r_basicprofile`, `w_member_social`, `w_organization_social`, `r_organization_social`, `rw_organization_admin`
- **Callback:** `{APP_URL}/api/auth/linkedin/callback`
- **Note:** Company page posting requires the "Community Management API" product — apply via dev portal. Uses versioned API headers: `LinkedIn-Version: 202401`, `X-Restli-Protocol-Version: 2.0.0`

### TikTok
- **Dev Portal:** https://developers.tiktok.com/
- **Create:** App in TikTok for Developers
- **Env vars:**
  ```
  TIKTOK_CLIENT_KEY=...
  TIKTOK_CLIENT_SECRET=...
  ```
- **OAuth scopes:** `user.info.basic`, `video.publish`, `video.upload`, `comment.list`, `comment.list.manage`
- **Callback:** `{APP_URL}/api/auth/tiktok/callback`
- **Note:** Uses `client_key` not `client_id`. Requires app review for production access. Video-only platform (no text-only posts).

### YouTube
- **Dev Portal:** https://console.cloud.google.com/apis
- **Enable APIs:** YouTube Data API v3
- **Create:** OAuth 2.0 Client ID (Web application type)
- **Env vars:**
  ```
  YOUTUBE_CLIENT_ID=...
  YOUTUBE_CLIENT_SECRET=...
  ```
- **OAuth scopes:** `https://www.googleapis.com/auth/youtube.upload`, `https://www.googleapis.com/auth/youtube.readonly`, `https://www.googleapis.com/auth/youtube.force-ssl`
- **Callback:** `{APP_URL}/api/auth/youtube/callback`
- **Note:** Requires Google Cloud project with billing enabled. Quota is 10,000 units/day by default. Upload endpoint is `https://www.googleapis.com/upload/youtube/v3`.

### Pinterest
- **Dev Portal:** https://developers.pinterest.com/apps/
- **Create:** App
- **Env vars:**
  ```
  PINTEREST_CLIENT_ID=...
  PINTEREST_CLIENT_SECRET=...
  ```
- **OAuth scopes:** `user_accounts:read`, `boards:read`, `pins:read`, `pins:write`
- **Callback:** `{APP_URL}/api/auth/pinterest/callback`
- **Note:** Token endpoint uses HTTP Basic auth (base64 encoded `client_id:client_secret`), not POST body. Optional env var `PINTEREST_API_BASE` to override API base URL.

### Threads (Meta)
- **Dev Portal:** Same Meta app (https://developers.facebook.com/apps)
- **Products to add:** Threads API
- **Env vars:** Same `META_APP_ID` / `META_APP_SECRET` (or separate if you prefer)
  ```
  THREADS_APP_ID=...
  THREADS_APP_SECRET=...
  ```
- **OAuth scopes:** `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_manage_replies`
- **Auth URL:** `https://threads.net/oauth/authorize`
- **API base:** `https://graph.threads.net/v1.0`
- **Callback:** `{APP_URL}/api/auth/threads/callback`
- **Note:** Uses long-lived token exchange similar to Instagram Personal. Token refresh via `/refresh_access_token`.

### Bluesky (NO dev app needed)
- **No dev portal or app registration required**
- **Auth type:** Session-based (AT Protocol) — NOT OAuth
- **Env vars:** None needed at app level
- **User provides:** Bluesky handle + App Password (generated at https://bsky.app/settings/app-passwords)
- **API base:** `https://bsky.social` (or custom PDS URL)
- **Connection flow:** User enters handle + app password in form fields (like current Bird CLI flow), stored in `platforms.config.credentials`
- **Key XRPC endpoints:** `com.atproto.server.createSession`, `com.atproto.repo.createRecord`, `com.atproto.repo.uploadBlob`

### Google Business Profile
- **Dev Portal:** https://console.cloud.google.com/apis
- **Enable APIs:** My Business Account Management API, My Business Business Information API, Google My Business API (v4 for posts)
- **Create:** OAuth 2.0 Client ID (Web application)
- **Env vars:**
  ```
  GOOGLE_BUSINESS_CLIENT_ID=...
  GOOGLE_BUSINESS_CLIENT_SECRET=...
  ```
  (Can reuse YouTube's Google Cloud project — same OAuth client if you want)
- **OAuth scopes:** `https://www.googleapis.com/auth/business.manage`
- **Callback:** `{APP_URL}/api/auth/google-business/callback`
- **Note:** Three different API base URLs:
  - Accounts: `https://mybusinessaccountmanagement.googleapis.com/v1`
  - Locations: `https://mybusinessbusinessinformation.googleapis.com/v1`
  - Posts: `https://mybusiness.googleapis.com/v4`

### Mastodon (per-instance app registration)
- **No central dev portal** — each Mastodon instance is separate
- **Auth type:** Instance OAuth (dynamic app registration)
- **Env vars:** None at app level
- **Connection flow:**
  1. User enters their instance URL (e.g., `https://mastodon.social`)
  2. App calls `POST /api/v1/apps` on that instance to register and get `client_id` + `client_secret`
  3. Standard OAuth flow from there
- **OAuth scopes:** `read`, `write`, `follow`
- **Store in config:** `instance_url`, `client_id`, `client_secret`, `accessToken`
- **Callback:** `{APP_URL}/api/auth/mastodon/callback`

---

## Summary: New Env Vars to Add

```env
# === Native Provider OAuth Credentials ===

# Meta (Facebook + Instagram + Threads)
META_APP_ID=
META_APP_SECRET=

# Threads (can reuse META_APP_ID or separate)
THREADS_APP_ID=
THREADS_APP_SECRET=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# TikTok (uses client_key, not client_id)
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# YouTube (Google Cloud)
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# Pinterest
PINTEREST_CLIENT_ID=
PINTEREST_CLIENT_SECRET=

# Google Business Profile (can share Google Cloud project with YouTube)
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=

# Bluesky — no app credentials needed (session-based)
# Mastodon — no app credentials needed (per-instance registration)
# Instagram Personal — uses META_APP_ID/SECRET
```

---

## Files to Modify in social-poster

| File | Change |
|------|--------|
| `src/lib/platforms.ts` | Add `threads`, `bluesky`, `google_business`, `mastodon` to `PLATFORM_TYPES` |
| `src/lib/connection-catalog.ts` | Add native OAuth methods as second tab per platform |
| `src/lib/pipeline/publish-service.ts` | Add native provider dispatch path |
| `src/db/schema.ts` | May need to expand platform type validation if any |
| `.env` / `.env.example` | Add all new OAuth credential env vars |
| `src/app/api/auth/[platform]/route.ts` | NEW — OAuth initiation |
| `src/app/api/auth/[platform]/callback/route.ts` | NEW — OAuth callback handler |
| `src/lib/providers/*` | NEW — entire provider framework (14+ files) |

## Files to Reference from brightbean-studio

All source provider implementations to port from:
```
/Users/maxpetrusenko/Desktop/Projects/oss/brightbean-studio/providers/
  __init__.py, base.py, types.py, exceptions.py,
  facebook.py, instagram.py, instagram_personal.py,
  linkedin.py, linkedin_personal.py, linkedin_company.py,
  tiktok.py, youtube.py, pinterest.py,
  threads.py, bluesky.py, google_business.py, mastodon.py
```

---

## Implementation Status (Codex, 2026-04-16)

Implemented:
- Core provider framework in `src/lib/providers/` with typed results, errors, fetch wrapper, credential env mapping, registry, and native publish adapter.
- Native TypeScript providers for Facebook, Instagram, Instagram Personal, LinkedIn personal/company, TikTok, YouTube, Pinterest, Threads, Bluesky, Google Business, and Mastodon.
- Native dispatch in `src/lib/pipeline/publish-service.ts`, keeping Bird and Late proxy paths intact.
- OAuth initiate/callback routes at `/api/auth/[platform]` and `/api/auth/[platform]/callback`.
- Token storage in `platforms.config.credentials`, plus refresh-before-publish when `expiresAt` is stale and `refreshToken` exists.
- Connection catalog/native OAuth options, Native/Proxy tabs, Late account auto-sync, and missing platform metadata for dashboard/composer flows.
- `.env.example` native provider credential keys.

Verified:
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Known gaps:
- No live OAuth or publish smoke tests yet; provider app credentials and real account tokens required.
- Bluesky and Mastodon still use manual connection forms for now.
- WhatsApp is present as a proxy/Late platform; native WhatsApp Cloud API publishing is not implemented because WhatsApp is message/send oriented rather than feed-post oriented.
- Dedicated encrypted credential table is still future work; tokens remain in `platforms.config.credentials`.

---

## Prompt to Give Claude for Implementation

```
Port the native social media provider implementations from brightbean-studio (Python) to social-poster (TypeScript/Next.js).

SOURCE: /Users/maxpetrusenko/Desktop/Projects/oss/brightbean-studio/providers/
TARGET: /Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/providers/

Read the handoff document at /Users/maxpetrusenko/Desktop/Projects/social-poster/HANDOFF-NATIVE-PROVIDERS.md for the full plan, architecture, and per-platform details.

Key rules:
1. Port Python → TypeScript, keeping the same API logic (URLs, scopes, request patterns)
2. Use fetch() instead of httpx
3. Keep the existing Late/Bird proxy path working — native is an ADDITIONAL provider option, not a replacement
4. Each platform connection UI should have two tabs: "Direct (Native)" and "Via Proxy (Late)"
5. Store OAuth tokens in platforms.config.credentials JSON
6. Create OAuth callback API routes at src/app/api/auth/[platform]/callback/route.ts
7. Add token refresh logic — check expiry before publish, auto-refresh if possible
8. Add new platforms to PLATFORM_TYPES: threads, bluesky, google_business, mastodon

Start with Phase 1 (core framework: types, errors, base, registry), then Phase 2 (port providers one by one starting with facebook), then Phase 3 (wire into publish-service), then Phase 4 (OAuth routes), then Phase 5 (update connection catalog UI).
```
