# Calendar Handoff — 2026-04-14

## Goal

Turn `/dashboard/calendar` into a real operator calendar backed by DB state, with better visibility into:

- scheduled recurring posts
- scheduled manual posts
- posted items
- failed items
- running items
- paused items

## What Was Done

### Navigation / page shell

- Restored `Calendar` as the clickable left-nav item.
- Removed the old large calendar hero.
- Added a simple `Calendar` page heading.

### Calendar data

- Calendar now reads from the real DB.
- Added calendar event shaping in `src/lib/dashboard/calendar.ts`.
- Sources now include:
  - `schedules` for recurring planned items
  - `posts.scheduledAt` for scheduled/manual items
  - `posts.publishedAt` for real posted items
  - `pipeline_runs` for non-post run history that still matters
- Published posts were previously missing from the calendar. That is fixed now.
- Run rows with `postId` are skipped to avoid duplicate fake/run-only copies when the real post exists.

### Calendar UI

- Reworked day cells to show:
  - time
  - media badge (`T`, `TI`, `TV`, etc.)
  - first line of the post
- Clicking the row opens a full preview card.
- Clicking the chevron expands inline text only.
- First 3 rows show by default.
- Extra rows expand inline inside the day cell.

### Preview card

- Preview modal is now solid white, not translucent.
- Preview can render the actual image/video when `mediaUrl` exists.
- Preview shows:
  - status
  - kind
  - platform icons
  - media chips
  - tags
  - full content

### Platform display

- Restored platform icons.
- Rows show actual platform icons instead of everything looking like X.
- Badges use content/media codes in the red notification bubble.
- Thread-specific `Th` is limited to thread/platform contexts, not used as a generic media badge.

### Status / legend

- Added visual states for:
  - recurring
  - posted
  - failed
  - running
  - paused
- Paused styling was softened so it reads as deprioritized, not heavy/dark.

### Controls

- Calendar controls moved into the card header on the right.
- Controls include:
  - prev / next
  - month label
  - today
  - refresh
  - list / calendar toggle
  - filters for status / media / platform / tags

### Refresh / runtime fixes

- `/dashboard/calendar` is now `force-dynamic`.
- Added scheduler reconcile endpoint:
  - `POST /api/scheduler/reconcile`
- Refresh button now:
  1. reconciles scheduler runtime
  2. refreshes the page
- `/api/health` now ensures scheduler registration before reporting status.
- Enabled Next instrumentation hook in `next.config.ts`.

## Root Cause Found

### Why the 3 PM schedule did not fire

The schedule row was enabled in SQLite, but the in-memory scheduler runtime had zero registered jobs.

State before fix:

- DB enabled schedules: `4`
- runtime registered schedules: `0`

That meant:

- schedules looked enabled in data
- calendar could show them
- but cron was not actually armed in runtime

After reconcile:

- DB enabled schedules: `4`
- runtime registered schedules: `4`
- drift: `0`

The 3 PM run on April 14, 2026 was missed because runtime was repaired after 3 PM ET had already passed.

## What Works Now

- Calendar left-nav works.
- Calendar route is DB-backed.
- Calendar refresh reads fresh DB state.
- Scheduler runtime can be reconciled from the app.
- Health endpoint reports DB/runtime drift.
- Recurring items render.
- Scheduled/manual items render.
- Published items render from `publishedAt`.
- Preview modal opens from row click.
- Inline expand works from chevron click.
- Media preview works when `mediaUrl` exists.
- Manual run rows without `postId` now fall back to schedule platform/media metadata, so X + LinkedIn badges still render in calendar.
- Platform icons render in rows and preview.
- Filters and list/calendar toggle work.

## Verification Update

- Manual run for `post-x-linkedin-3pm` was triggered on April 14, 2026 at about `3:22 PM ET`.
- Result:
  - LinkedIn publish succeeded
  - X publish failed through Bird with `HTTP 401` / `Could not authenticate you`
  - Pipeline run status stayed `failed` because publish outcomes were mixed
- Calendar now shows that failed run on April 14 with:
  - `X` + `LinkedIn` platform badges
  - image media badge
  - schedule-derived preview copy

## Known Gaps / Caveats

- If an event has no stored `mediaUrl`, preview cannot show the actual asset.
- Some platform-specific format badges are still inferred, not fully modeled in schema.
- Existing unrelated type errors still exist outside calendar:
  - `src/app/dashboard/replies/page.tsx`
  - `src/lib/replies/live.ts`
- `npm run lint` passes.
- Full `typecheck` / `build` are still blocked by those unrelated replies errors.

## Recommended Next Steps

1. Manually trigger the missed `3 PM` schedule once.
2. Verify the run appears in calendar with the correct status.
3. Verify X + LinkedIn target/platform rendering on the resulting post.
4. Decide whether paused schedules should stay visible by default or only under a filter.
5. If needed, store richer per-platform format metadata in schema instead of inferring it.
6. Fix unrelated replies type errors so full build/typecheck is green again.

## Suggested Test Plan

1. Open `/dashboard/calendar`.
2. Click refresh.
3. Confirm health/runtime is in sync.
4. Manually run `post-x-linkedin-3pm`.
5. Refresh calendar again.
6. Confirm:
   - row appears for today
   - preview opens
   - media preview renders if media exists
   - posted/failed/running state is correct
   - platform icons match actual targets
