# Settings Expansion Plan

**Date:** 2026-04-20
**Status:** Complete
**Branch:** dev

---

## Overview

Add four major settings features modeled after Zernio's settings UX: tabbed settings page (Usage, Profile, Notifications, Danger Zone), API Keys management, billing/plan display, and usage tracking per connected account.

---

## Phase 1: Schema — New Tables

### 1.1 `api_keys` table
```sql
id            TEXT PRIMARY KEY
workspaceId   TEXT NOT NULL → workspaces.id
name          TEXT NOT NULL              -- user-chosen label ("getlate", "mobile-app")
keyHash       TEXT NOT NULL              -- bcrypt/sha256 hash of the full key
keyPrefix     TEXT NOT NULL              -- first 8 chars for display ("sk_0a5ac...")
keySuffix     TEXT NOT NULL              -- last 6 chars for display ("...f209c")
scope         TEXT DEFAULT 'all'         -- 'all' | 'profile:{id}' | custom
permission    TEXT DEFAULT 'read'        -- 'read' | 'read_write'
status        TEXT DEFAULT 'active'      -- 'active' | 'revoked'
lastUsedAt    DATETIME
createdAt     DATETIME DEFAULT NOW
revokedAt     DATETIME
createdBy     TEXT NOT NULL → users.id
```

### 1.2 `notification_preferences` table
```sql
id            TEXT PRIMARY KEY
userId        TEXT NOT NULL → users.id
workspaceId   TEXT NOT NULL → workspaces.id
postFailures  BOOLEAN DEFAULT true
accountDisconnects BOOLEAN DEFAULT true
paymentAlerts BOOLEAN DEFAULT true
usageAlerts   BOOLEAN DEFAULT true
marketingEmails BOOLEAN DEFAULT true
createdAt     DATETIME DEFAULT NOW
updatedAt     DATETIME DEFAULT NOW
```
Unique on (userId, workspaceId).

### 1.3 `usage_events` table
```sql
id            TEXT PRIMARY KEY
workspaceId   TEXT NOT NULL → workspaces.id
platformId    TEXT → platforms.id (nullable for workspace-level events)
eventType     TEXT NOT NULL              -- 'post_published' | 'upload' | 'api_call' | 'schedule_run'
metadata      TEXT (JSON)
createdAt     DATETIME DEFAULT NOW
```

### 1.4 Add plan fields to `organizations`
```sql
plan          TEXT DEFAULT 'free'        -- 'free' | 'starter' | 'pro' | 'business'
planLabel     TEXT DEFAULT 'Free'
maxProfiles   INTEGER DEFAULT 5
maxPlatforms  INTEGER DEFAULT 3
maxPostsPerMonth INTEGER DEFAULT 50
billingEmail  TEXT
billingCycleStart DATETIME
```

---

## Phase 2: Settings Page Redesign

### 2.1 Tabbed settings layout (like Zernio)
- **Route:** `/dashboard/settings` with `?tab=` query param
- **Tabs:** Usage | Profile | Notifications | Danger Zone
- Replace current root settings page (env var viewer) with the tabbed layout
- Each tab is a section within the same page (server component with client tab switcher)

### 2.2 Usage tab (default)
- Header: "Usage" / "Current billing cycle usage for your {plan} plan"
- Metric cards:
  - **Posts Published** — count / limit (or /Unlimited), resets date
  - **Profiles** — count / max, with progress bar
  - **Connected Accounts** — count / max, with progress bar
  - **API Calls** — count / limit this month
  - **Uploads** — count / limit
- Per-platform breakdown: table showing each connected account with post count this cycle

### 2.3 Profile tab
- Replace the stub at `/dashboard/settings/profile`
- Show user's name, email, avatar
- Edit name, upload avatar
- Change email (with verification)
- Password section (if applicable) or just "Logged in via Google/Magic Link"

### 2.4 Notifications tab
- Toggle switches for each notification type (matching Zernio screenshot):
  - **Post Failures** — "Get notified when scheduled posts fail to publish"
  - **Account Disconnects** — "Get notified when social accounts get disconnected"
  - **Payment Alerts** — "Get notified when subscription payments fail"
  - **Usage Alerts** — "Receive warnings when approaching or reaching your plan limits"
  - **Marketing Emails** — "Occasional product updates, tips, and promotional emails"
- Footer note: "Critical account and security emails cannot be disabled."
- Backed by `notification_preferences` table

### 2.5 Danger Zone tab
- Delete workspace
- Delete organization
- Export data
- (reuse existing org deletion actions)

---

## Phase 3: API Keys Page

### 3.1 Route & UI
- **Route:** `/dashboard/settings/api-keys`
- **Nav:** Add to Settings or footer nav
- Header: "API Keys" / "Authentication tokens for the programmatic API"
- "+ Create key" button (primary, top right)
- Search bar + filter dropdowns (All statuses, All permissions)
- Table columns: Name (+ date created), Key (masked middle), Scope, Status badge, Permission badge
- Row actions: Copy full key (only on create), Revoke

### 3.2 Create Key dialog/modal
- Name input (required)
- Scope selector: "All profiles" or pick specific profile
- Permission: "Read" or "Read & Write"
- On create: show full key ONCE with copy button + warning "This key won't be shown again"

### 3.3 API endpoints
- `POST /api/api-keys` — create key (returns full key once)
- `GET /api/api-keys` — list keys (masked)
- `DELETE /api/api-keys/[id]` — revoke key
- API key auth middleware: check `Authorization: Bearer sk_...` header, hash and lookup

---

## Phase 4: Billing Display

### 4.1 Plan badge in sidebar
- Show current plan name + badge in the sidebar footer (like Zernio's "AppSumo License / Tier 2 / ACTIVE / Lifetime Access")
- Read from organization's `plan` field

### 4.2 Billing settings tab (or separate page)
- Current plan card with name, status, billing cycle
- For now: display-only (no Stripe integration yet)
- Upgrade CTA button (links to external page or shows modal)
- Invoice history placeholder

---

## Phase 5: Usage Tracking Integration

### 5.1 Track events
- On post publish: insert `usage_events` row with `post_published`
- On API key use: insert `usage_events` row with `api_call`
- On file upload: insert `usage_events` row with `upload`
- On schedule run: insert `usage_events` row with `schedule_run`

### 5.2 Usage queries
- `getUsageSummary(workspaceId, cycleStart)` — aggregate counts by eventType
- `getUsageByPlatform(workspaceId, cycleStart)` — group by platformId
- Used by the Usage tab in settings

---

## Implementation Order

1. **Schema migration** (Phase 1) — add tables + org fields
2. **Settings tabbed layout + Notifications** (Phase 2.1, 2.4) — most visible, quickest win
3. **Usage tab** (Phase 2.2) — depends on schema
4. **Profile tab** (Phase 2.3)
5. **API Keys page** (Phase 3) — standalone page
6. **Billing display** (Phase 4) — display only for now
7. **Usage tracking hooks** (Phase 5) — wire into publish/api/upload flows

---

## Files to Create
- `src/app/dashboard/settings/api-keys/page.tsx`
- `src/components/settings/settings-tabs.tsx` (client tab switcher)
- `src/components/settings/usage-tab.tsx`
- `src/components/settings/profile-tab.tsx`
- `src/components/settings/notifications-tab.tsx`
- `src/components/settings/danger-zone-tab.tsx`
- `src/components/settings/api-keys-table.tsx`
- `src/lib/usage.ts` (usage queries)
- `src/app/api/api-keys/route.ts`
- `src/app/api/api-keys/[id]/route.ts`

## Files to Modify
- `src/db/schema.ts` (new tables + org fields)
- `src/app/dashboard/settings/page.tsx` (replace with tabbed layout)
- `src/app/dashboard/settings/actions.ts` (notification prefs actions)
- `src/lib/dashboard-shell.ts` (add API Keys nav item)
- `src/components/dashboard/drawer-shell.tsx` (plan badge in footer, headerCopy)
