# Post History Migration Plan

Last updated: 2026-04-24

## Purpose

Ship durable post history without breaking current publish flows.

Read when:
- migrating `posts` or `post_targets`
- changing delete/edit/calendar/history behavior
- planning rollout for lifecycle schema changes

Depends on:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/post-history-architecture.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/migration-and-rollout-runbook.md`

## Strategy

Use an additive migration.

Do not:
- repurpose `publishedAt`
- delete existing history rows to fit the new model
- cut calendar/history reads in the same deploy that introduces new tables

Do:
- add tables first
- dual-write next
- backfill after code lands
- switch reads after verification

## Phase 0. Freeze Destructive Semantics

Goal:
- stop making history worse before deeper migration

Changes:
- replace hard delete behavior for published posts
- stop nulling `publishedAt` to simulate removal
- stop deleting and recreating `post_targets` blindly on edit

Primary files:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/delete/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/route.ts`

Rules:
- draft-only hard delete can stay temporarily
- scheduled/published/failed/partial posts must use tombstone-style updates

Acceptance:
- no operator action can erase a published post from DB history

## Phase 1. Additive Schema

Goal:
- introduce durable history structures without changing reads yet

Schema work:
- add new columns to `posts`
  - `lifecycle_status`
  - `current_revision_id`
  - `first_published_at`
  - `latest_published_at`
  - `archived_at`
  - `deleted_internal_at`
  - `deleted_external_at`
  - `superseded_by_post_id`
  - `rolled_back_from_post_id`
- create `post_revisions`
- create `post_events`

Optional later:
- `post_target_events`

Migration rules:
- additive only
- no dropping old columns
- keep old `status`, `content`, `mediaUrl`, `publishedAt` during compatibility window

Acceptance:
- app boots with old logic untouched
- schema applies on populated SQLite

## Phase 2. Dual Write

Goal:
- keep old behavior working while writing new history records

Write paths to patch:
- post create
- post update
- schedule create/update that materialize posts
- manual publish
- scheduled publish
- delete/restore/archive actions
- retry/recovery flows

Primary files:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/publish/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/delete/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/pipeline/runners/image-post.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/pipeline/runners/avatar-video.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/pipeline-runs/[id]/retry/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/pipeline-runs/[id]/draft/route.ts`

Dual-write rules:
- every create writes:
  - one `posts` row
  - one `post_revisions` row
  - one `post_events` row for `post_created`
- every edit writes:
  - new revision row
  - `post_updated` and `revision_created` events
- every publish attempt writes:
  - publish started event
  - per-target success/failure events
  - post-level resolved outcome event
- delete/archive/restore writes lifecycle events

Acceptance:
- new rows accumulate correctly
- old UI still works

## Phase 3. Backfill Existing Data

Goal:
- reconstruct durable history for existing posts

Backfill sources:
- `posts`
- `post_targets`
- `pipeline_runs`
- `audit_events`
- `activity_log`

Backfill order:
1. create baseline revision for every existing post
2. create `post_created` event from `posts.createdAt`
3. create `post_scheduled` event when `scheduledAt` exists
4. create publish events from `post_targets.publishedAt` and `posts.publishedAt`
5. create failure events from `post_targets.error` and failed run outcomes
6. create delete events from audit/activity rows where available

Backfill rules:
- do not guess more precision than data supports
- if only post-level timestamp exists, use a post-level event
- if target-level timestamp exists, use target-level event
- mark reconstructed events in payload:
  - `source: "backfill"`
  - `confidence: "exact" | "derived"`

Acceptance:
- every historical post has at least one revision and one lifecycle event

## Phase 4. Query Cutover

Goal:
- make product history surfaces read from durable truth

Cut over in this order:

### 4.1 Activity/log surfaces

Reason:
- lowest user risk
- easiest place to validate lifecycle events

Primary files:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/dashboard/action-log.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/audit-activity.ts`

### 4.2 Posts list and post detail

Reason:
- should expose deleted/rolled-back/superseded states before calendar changes

Primary files:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/dashboard/posts/page.tsx`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/dashboard/posts/[id]/page.tsx`

### 4.3 Calendar/history

Reason:
- highest visibility
- should change only after lifecycle data is verified

Primary files:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/dashboard/calendar.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/dashboard/calendar/page.tsx`

Calendar cutover rules:
- use scheduled posts from current `posts`
- use historical lifecycle events for deleted/rolled-back state
- keep `pipeline_runs` as execution detail
- do not silently hide historical artifacts because `publishedAt` changed

Acceptance:
- deleted/rolled-back posts remain visible in history
- failed posts can show both post artifact and execution truth where useful

## Phase 5. Behavior Upgrade

Goal:
- replace compatibility shortcuts with durable semantics

Changes:
- delete route becomes tombstone/archive route for non-draft posts
- external delete becomes explicit provider workflow
- rollback creates lineage instead of mutation
- target edits become patch operations, not full target-row recreation

Provider-specific note:
- only call external delete for providers/accounts that support it
- unsupported providers still record lifecycle events

Acceptance:
- operator can understand exactly what happened from UI and DB state

## Phase 6. Compatibility Cleanup

Goal:
- remove dependence on legacy mutable-history assumptions

Cleanup candidates:
- old synthetic action-log derivations from current `posts`
- calendar assumptions that only `published` and `partial_failure` belong in history
- update paths that rebuild target rows

Do not drop old columns until:
- dual-write is stable
- backfill verified
- reads switched
- rollback path proven

## Concrete Risks

### Risk 1. Duplicate history rows during backfill + dual-write

Mitigation:
- `dedupeKey` on `post_events`
- explicit event source markers

### Risk 2. Calendar double-renders post and run

Mitigation:
- keep separate event identity rules
- define precedence:
  - post artifact for lifecycle history
  - run artifact for execution detail

### Risk 3. Delete semantics differ by provider

Mitigation:
- model unsupported state explicitly
- do not pretend external deletion happened when it did not

### Risk 4. Old data missing timestamps

Mitigation:
- backfill with `confidence = derived`
- prefer exact target timestamps when present

### Risk 5. FK and cascade surprises

Mitigation:
- verify live schema before rollout
- keep deletions additive and non-destructive

## Verification Checklist

### Local

- migration applies on empty DB
- migration applies on current populated DB
- create/edit/publish/delete flows dual-write correctly
- backfill script is idempotent
- calendar still renders current month
- deleted historical posts remain visible after refresh

### Live

- one draft delete
- one scheduled delete
- one published external delete attempt
- one rollback/supersede flow
- one calendar verification after refresh
- one posts list verification after refresh

## Suggested Implementation Order

1. schema migration
2. `post_events` write helper
3. `post_revisions` write helper
4. patch create/update/delete/publish paths
5. patch runner write paths
6. backfill command
7. action-log cutover
8. posts UI cutover
9. calendar cutover
10. compatibility cleanup

## Definition Of Done

This migration is done when:
- published history cannot disappear because of delete/edit
- calendar/history survives refresh after rollback or deletion
- old per-target publish metadata survives post edits
- internal and external deletion are distinguishable in UI and DB
- lifecycle can be reconstructed from revisions + events without relying on mutable current rows
