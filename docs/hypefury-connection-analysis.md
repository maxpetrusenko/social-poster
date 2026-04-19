# Hypefury Connection & Auth Flow Analysis

> Crawled from https://app.hypefury.com + https://hypefury.crisp.help on 2026-04-17

---

## 1. Core Architecture

**Hypefury uses Twitter/X as THE primary identity provider.** No email/password, no Google login. Just one button: "Sign in with Twitter."

- **Auth backend:** Firebase Auth (firebasejs UI visible on login page)
- **Primary login:** Twitter OAuth (the ONLY way to create an account)
- **Secondary connections:** Added post-login via Settings > Connections
- **Twitter-first design:** Everything revolves around Twitter as the hub; other platforms are "cross-post destinations"

---

## 2. Platform Support Matrix

| Platform | Role | Auth Method | Connection Point |
|---|---|---|---|
| **Twitter/X** | Primary (login + posting) | OAuth 2.0 (Firebase) | Login page |
| **Instagram** | Cross-post destination | OAuth via Facebook | Settings > Connections |
| **LinkedIn** | Cross-post destination | OAuth 2.0 popup | Settings > Connections |
| **Facebook** | Cross-post destination | OAuth popup (page select) | Settings > Connections |
| **Threads** | Cross-post destination | OAuth (via Meta) | Settings > Connections |
| **TikTok** | Cross-post destination | OAuth 2.0 | Settings > Connections |
| **Bluesky** | Cross-post destination | App Password (credentials) | Settings > Connections |
| **Mastodon** | Cross-post destination | OAuth 2.0 (instance-based) | Settings > Connections |
| **Gumroad** | Sales integration | OAuth / API key | Settings > Integrations |

---

## 3. Auth Flow Diagrams

### 3A. Primary Login: Sign in with Twitter (via Firebase)

```
┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────┐
│  User    │    │  Hypefury    │    │ Firebase │    │ Twitter  │
│ Browser  │    │  Frontend    │    │   Auth   │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘    └────┬─────┘
     │                 │                 │               │
     │  Click "Sign in │                 │               │
     │  with Twitter"  │                 │               │
     │────────────────>│                 │               │
     │                 │                 │               │
     │                 │ signInWithPopup  │               │
     │                 │ (TwitterAuth     │               │
     │                 │  Provider)       │               │
     │                 │────────────────>│               │
     │                 │                 │               │
     │  Twitter OAuth popup opens        │               │
     │<──────────────────────────────────────────────────│
     │                 │                 │               │
     │  User authorizes Hypefury app     │               │
     │──────────────────────────────────────────────────>│
     │                 │                 │               │
     │                 │                 │  OAuth tokens │
     │                 │                 │<──────────────│
     │                 │                 │               │
     │                 │  Firebase user   │               │
     │                 │  + Twitter       │               │
     │                 │  access_token    │               │
     │                 │  + access_secret │               │
     │                 │<────────────────│               │
     │                 │                 │               │
     │                 │  Store user in   │               │
     │                 │  Firestore DB    │               │
     │                 │  (with Twitter   │               │
     │                 │   credentials)   │               │
     │                 │                 │               │
     │  Redirect to    │                 │               │
     │  /dashboard     │                 │               │
     │<────────────────│                 │               │
     │                 │                 │               │

KEY INSIGHT: Firebase stores Twitter OAuth tokens.
Hypefury gets BOTH user auth AND Twitter API access
from a single sign-in action.
```

### 3B. Twitter OAuth Details (What Firebase Handles)

```
Firebase Twitter Auth Provider uses OAuth 1.0a:

1. App registers with Twitter Developer Portal
   - Consumer Key (API Key)
   - Consumer Secret (API Secret)

2. Firebase handles the 3-legged OAuth:
   - Request Token → Authorization → Access Token
   
3. Returns to app:
   - firebase.User (uid, displayName, photoURL)
   - twitter.com credential containing:
     ├── accessToken (user's OAuth access token)
     ├── secret (user's OAuth access secret)  
     └── These allow posting on behalf of user

4. Hypefury stores in their DB:
   - Firebase UID
   - Twitter handle / user ID
   - OAuth access token + secret
   - Subscription tier
   - Connected platform tokens
```

### 3C. Secondary Connection: Instagram (via Facebook OAuth)

```
┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────┐
│  User    │    │  Hypefury    │    │ Hypefury │    │ Facebook │
│ Browser  │    │  Settings    │    │  Backend │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘    └────┬─────┘
     │                 │                 │               │
     │  Click Connect  │                 │               │
     │  Instagram      │                 │               │
     │────────────────>│                 │               │
     │                 │                 │               │
     │  Facebook OAuth │                 │               │
     │  popup opens    │                 │               │
     │<────────────────│                 │               │
     │                 │                 │               │
     │  Login to FB +  │                 │               │
     │  authorize      │                 │               │
     │──────────────────────────────────────────────────>│
     │                 │                 │               │
     │  Select FB Page │ (linked to IG)  │               │
     │──────────────────────────────────────────────────>│
     │                 │                 │               │
     │  Grant perms:   │                 │               │
     │  instagram_     │                 │               │
     │  basic,         │                 │               │
     │  content_publish│                 │               │
     │──────────────────────────────────────────────────>│
     │                 │                 │               │
     │                 │                 │  Access token │
     │                 │                 │<──────────────│
     │                 │                 │               │
     │                 │  Store IG token  │               │
     │                 │  linked to user  │               │
     │                 │                 │               │
     │  IG Connected!  │                 │               │
     │<────────────────│                 │               │

REQUIREMENTS:
- Instagram must be Business account (NOT Creator)
- Must be linked to a Facebook Page
- Max 24 auto-posts per day
```

### 3D. Secondary Connection: LinkedIn (OAuth popup)

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Hypefury    │    │ LinkedIn │
│ Browser  │    │  Settings    │    │  OAuth   │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Click Connect  │                 │
     │  LinkedIn       │                 │
     │────────────────>│                 │
     │                 │                 │
     │  LinkedIn OAuth │                 │
     │  popup opens    │                 │
     │<────────────────│                 │
     │                 │                 │
     │  Login + auth   │                 │
     │─────────────────────────────────>│
     │                 │                 │
     │  Callback with  │                 │
     │  auth code      │                 │
     │<─────────────────────────────────│
     │                 │                 │
     │  Token exchange │                 │
     │────────────────>│                 │
     │                 │                 │
     │  Connected!     │                 │
     │  (can post to   │                 │
     │   personal +    │                 │
     │   company pages)│                 │
     │<────────────────│                 │
     
NOTES:
- Simple OAuth popup (no secondary selection in UI)
- Company page posting: connected account must have admin rights
- No explicit org selection step shown to user
```

### 3E. Secondary Connection: Facebook (Page Select)

```
Same as Instagram flow but:
1. OAuth popup to Facebook
2. Login with authorized account
3. Select which Facebook Page to connect (only 1)
4. Store page access token
5. Can cross-post tweets or schedule FB-exclusive posts
```

### 3F. Secondary Connection: Bluesky (Credentials)

```
┌──────────┐    ┌──────────────┐    ┌──────────┐
│  User    │    │  Hypefury    │    │ Bluesky  │
│ Browser  │    │  Settings    │    │  ATP     │
└────┬─────┘    └──────┬───────┘    └────┬─────┘
     │                 │                 │
     │  Enter username │                 │
     │  + app password │                 │
     │────────────────>│                 │
     │                 │                 │
     │                 │ createSession   │
     │                 │────────────────>│
     │                 │ { accessJwt,    │
     │                 │   refreshJwt }  │
     │                 │<────────────────│
     │                 │                 │
     │  Connected!     │                 │
     │<────────────────│                 │

Same as our Bluesky provider.
No OAuth - direct credential auth via AT Protocol.
```

---

## 4. Key Architectural Differences: Hypefury vs Our App

| Aspect | Hypefury | Our App (social-poster) |
|---|---|---|
| **Primary login** | Twitter OAuth (Firebase) | Supabase Auth (Google/email) |
| **Twitter role** | Identity + posting | Just a connected platform |
| **Auth backend** | Firebase Auth | Supabase Auth |
| **Token storage** | Firestore | Supabase `platforms` table |
| **OAuth flow** | Popup-based (Firebase SDK) | Redirect-based (server routes) |
| **Platform priority** | Twitter-first, others secondary | All platforms equal |
| **Account model** | 1 Twitter = 1 account | 1 user = many platforms |

---

## 5. What We Can Learn / Steal

### 5A. "Sign in with Twitter" as Onboarding Shortcut
Hypefury gets TWO things from one action:
1. User account creation (Firebase user)
2. Twitter API access (OAuth tokens)

**For our app:** We could add "Sign in with Twitter" as a Supabase OAuth provider. On first login:
- Create Supabase user
- Store Twitter OAuth tokens in `platforms` table
- User lands on dashboard with Twitter already connected

### 5B. Popup-Based OAuth (vs Redirect)
Hypefury uses popup windows for secondary connections. Benefits:
- User stays on settings page
- No full-page redirect / state loss
- Feels faster

**For our app:** We use server-side redirects (`/api/auth/[platform]`). Could switch to popup-based for smoother UX but adds complexity.

### 5C. Firebase vs Supabase for Social Auth

```
Firebase Twitter Auth:
  ✓ Built-in Twitter provider
  ✓ Handles OAuth 1.0a complexity
  ✓ Returns access_token + secret automatically
  ✗ Vendor lock-in
  ✗ Twitter-specific (not all platforms)

Supabase Auth:
  ✓ Supports Twitter, Google, Facebook, etc.
  ✓ Open source, self-hostable
  ✓ We already use it
  ✗ Doesn't return platform API tokens by default
  ✗ Need custom logic to extract + store tokens
```

---

## 6. Platform-Specific Connection Requirements (from Hypefury docs)

### Instagram
- Must be **Business account** (NOT Creator)
- Must be linked to a **Facebook Page**
- OAuth goes through Facebook (Meta Graph API)
- Max 24 auto-posts per day
- Permissions: `instagram_basic`, `instagram_content_publish`

### LinkedIn
- Simple OAuth popup
- Company page posting requires admin rights on that page
- No explicit org selection (auto-detects from connected account)

### Facebook
- OAuth popup with page selection
- Must select exactly 1 Facebook Page
- Authorized account must have page admin access

### Threads
- Via Meta OAuth (similar to Instagram)
- Relatively new integration

### TikTok
- OAuth 2.0
- Video-only platform (no text-only posts)

### Bluesky
- Username + App Password (no OAuth)
- AT Protocol session auth
- Same as what we already have

### Mastodon
- Instance-based OAuth 2.0
- User provides instance URL first
- Same as what we already have

---

## 7. Implementation Recommendations for social-poster

### Quick Win: Add "Sign in with X/Twitter" 
```
Supabase supports Twitter as an OAuth provider.
On sign-in callback, extract and store Twitter tokens.

1. Enable Twitter provider in Supabase dashboard
2. Set Twitter API keys (we have them)
3. On callback, save access_token to platforms table
4. User gets Twitter connected on first login

Effort: ~2-4 hours
Impact: Major onboarding improvement for Twitter-focused users
```

### Medium: Popup-Based Secondary Connections
```
Current: Full page redirect → callback → redirect back
Better: Open popup → OAuth in popup → postMessage back → close popup

Benefits:
- No page reload
- User sees their settings page throughout
- Feels polished

Effort: ~1 day per platform
```

### Skip: Firebase Migration
```
No reason to migrate from Supabase to Firebase.
Our Supabase setup handles everything Firebase does.
We just need to wire up the Twitter provider.
```

---

## 8. Comparison: Our Providers vs Hypefury's

| Platform | We Have | Hypefury Has | Gap |
|---|---|---|---|
| Twitter/X | `twitter.ts` (OAuth 2.0) | Firebase (OAuth 1.0a) | Different OAuth version |
| Instagram | `instagram.ts` (OAuth) | FB OAuth popup | Same approach |
| LinkedIn | `linkedin-personal.ts` + `linkedin-company.ts` | Single OAuth popup | We have more granular |
| Facebook | `facebook.ts` (OAuth) | FB OAuth + page select | Same approach |
| Threads | `threads.ts` (OAuth) | Meta OAuth | Same |
| TikTok | `tiktok.ts` (OAuth) | OAuth 2.0 | Same |
| YouTube | `youtube.ts` (OAuth) | Not supported | We're ahead |
| Pinterest | `pinterest.ts` (OAuth) | Not supported | We're ahead |
| Google Business | `google-business.ts` | Not supported | We're ahead |
| Bluesky | `bluesky.ts` (credentials) | App Password | Same |
| Mastodon | `mastodon.ts` (OAuth) | OAuth (instance) | Same |
| Gumroad | Not implemented | API integration | They have sales features |

**We support MORE platforms than Hypefury.** Their focus is depth on Twitter, not breadth.
