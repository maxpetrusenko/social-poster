# Posts Redesign Plan

**Date:** 2026-04-20
**Status:** Complete
**Branch:** dev

---

## Overview

Redesign the Posts section to match Zernio's UX: grid-based post listing, Zernio-style "Create Post" composer with platform-specific previews and options, and consolidated navigation (merge Recurrent Posts as submenu).

---

## Phase 1: Navigation Restructure

### 1.1 Remove "Create Idea" from sidebar
- **File:** `src/lib/dashboard-shell.ts`
- Remove the "Create Idea" nav item from `workspaceShellNav`
- Delete `src/app/dashboard/create-idea/` directory entirely

### 1.2 Rename & restructure "Posts" nav
- **File:** `src/lib/dashboard-shell.ts`
- Change sidebar to have "Posts" as a parent item with sub-items:
  - **All Posts** → `/dashboard/posts` (grid view)
  - **Create Post** → `/dashboard/posts/create` (new composer)
  - **Recurrent Posts** → `/dashboard/categories` (existing)
- Do NOT include X Replies under schedules

### 1.3 Update drawer-shell for submenu support
- **File:** `src/components/dashboard/drawer-shell.tsx`
- Add collapsible submenu support for nav items that have children
- "Posts" shows chevron, expands to show sub-items

---

## Phase 2: Posts Grid View (Zernio-style)

### 2.1 Redesign Posts page layout
- **File:** `src/app/dashboard/posts/page.tsx`
- Replace current vertical list with responsive grid
- Layout: newest post on left → flows right, then next row
- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Each card shows:
  - Media thumbnail (if image/video post) or text preview
  - Post title (truncated)
  - Status badge
  - Platform icons for targets
  - Scheduled/published date
  - Content type indicator

### 2.2 Keep filter tabs
- Same status filter tabs (all, draft, scheduled, published, partial_failure, failed)
- "Create Post" button in header links to `/dashboard/posts/create`

---

## Phase 3: Create Post Composer (Zernio-style)

### 3.1 New Create Post page
- **Route:** `/dashboard/posts/create`
- **File:** `src/app/dashboard/posts/create/page.tsx` (server component wrapper)
- **Component:** `src/components/create-post-composer.tsx` (client component)

### 3.2 Two-column layout (matching Zernio screenshots)
**Left Column:**
- Content textarea with placeholder "what's on your mind..."
- Character count display
- "+ Add media" button → file upload or URL input
- Media preview area (uploaded images shown inline)
- Platform-specific options section (appears below when platform selected):
  - **Instagram:** Feed/Story/Reel/Carousel tabs, collaborators (max 3), first comment (0/2200), custom caption (0/2200)
  - **Facebook:** Feed/Story/Reel tabs, first comment (0/8000), custom caption (0/63206)
  - **X (Twitter):** Thread toggle, custom caption (0/25000)
  - **Pinterest:** Board selector, pin description
  - **TikTok:** Description, visibility settings
  - **Reddit:** Subreddit, title, flair
  - **YouTube:** Title, description, visibility
  - **LinkedIn:** Custom caption

**Right Column:**
- **Profiles** dropdown ("Default Profile" selector)
- **Platforms** grid (from 1 profile):
  - Cards with platform icon + avatar + handle
  - Click to select/deselect (green checkmark when selected)
  - "Missing media content" warning (orange dot) when media required
  - "save as group" link
- **Publishing** section:
  - Tab bar: Schedule | Now | Queue | Draft
  - Date & time picker (when Schedule selected)
  - Timezone dropdown (default: America/New York)
- **Action buttons:** Cancel | Schedule Post (primary)

### 3.3 Platform-specific image handling
- When media is added and a platform is selected, show resize info per platform:
  - **Instagram Feed:** 1080x1080 (square), 1080x1350 (portrait), 1080x566 (landscape)
  - **Instagram Story/Reel:** 1080x1920
  - **Facebook Feed:** 1200x630
  - **Facebook Story/Reel:** 1080x1920
  - **X/Twitter:** 1200x675 (16:9)
  - **Pinterest:** 1000x1500 (2:3)
  - **TikTok:** 1080x1920
  - **LinkedIn:** 1200x627
  - **YouTube thumbnail:** 1280x720
- Show crop/resize preview per platform in the preview section
- Multiple photos: allow adding multiple images per platform that supports it

### 3.4 Post preview
- Live preview panel showing how the post will look on each selected platform
- Tabbed by platform (click platform icon to see that preview)
- Approximate the platform's native look (card format, avatar, handle, content, media)

---

## Phase 4: Schema & API Updates

### 4.1 Extend posts table (if needed)
- Add `platformOverrides` JSON column for per-platform custom captions, first comments, etc.
- Structure: `{ [platformId]: { caption?: string, firstComment?: string, format?: "feed"|"story"|"reel"|"carousel", collaborators?: string[] } }`

### 4.2 Media upload support
- Add file upload endpoint: `POST /api/uploads`
- Store to local filesystem or S3-compatible storage
- Return URL for use in post
- Support multiple images per post (update `mediaUrl` to `mediaUrls` JSON array or add `postMedia` table)

### 4.3 Update post creation API
- `POST /api/posts` accepts new fields: `platformOverrides`, `mediaUrls`
- Validate per-platform constraints

---

## Phase 5: Integration & Cleanup

### 5.1 Update header copy in drawer-shell
- **File:** `src/components/dashboard/drawer-shell.tsx`
- Update `headerCopy` array to remove create-idea entry
- Add entry for `/dashboard/posts/create`

### 5.2 Remove dead routes
- Delete `src/app/dashboard/posts/new/` (currently redirects)
- Delete `src/app/dashboard/create-idea/`

### 5.3 Update existing links
- `src/app/dashboard/publish/page.tsx` — update "Create Idea" and "New Post" buttons to `/dashboard/posts/create`
- Any other references to `/dashboard/create-idea` or `/dashboard/posts/new`

---

## Implementation Order

1. **Nav restructure** (Phase 1) — ~1 session
2. **Posts grid** (Phase 2) — ~1 session
3. **Create Post composer** (Phase 3) — ~2-3 sessions (largest piece)
4. **Schema/API** (Phase 4) — ~1 session
5. **Cleanup** (Phase 5) — ~0.5 session

---

## Files to Create
- `src/app/dashboard/posts/create/page.tsx`
- `src/components/create-post-composer.tsx`
- `src/lib/platform-specs.ts` (image dimensions, char limits per platform)

## Files to Modify
- `src/lib/dashboard-shell.ts` (nav restructure)
- `src/components/dashboard/drawer-shell.tsx` (submenu support, header copy)
- `src/app/dashboard/posts/page.tsx` (grid layout)
- `src/db/schema.ts` (platformOverrides column)
- `src/app/dashboard/publish/page.tsx` (update links)

## Files to Delete
- `src/app/dashboard/create-idea/page.tsx`
- `src/app/dashboard/posts/new/page.tsx`
