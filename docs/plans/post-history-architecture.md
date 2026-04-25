# Post History Architecture

Last updated: 2026-04-24

## Purpose

Define the target architecture for durable post history, deletion semantics, rollback behavior, and calendar/history truth.

Read when:
- changing `posts`, `post_targets`, or `pipeline_runs`
- changing calendar/history queries
- changing delete, retry, restore, or rollback behavior
- changing how publish outcomes are recorded

Depends on:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/migration-and-rollout-runbook.md`

## Problem

Current app state is operational, but not durable enough for a SaaS product.

Main issues in current code:
- local post delete is a hard delete:
  - `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/delete/route.ts`
- editing platform targets destroys per-target history:
  - `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/route.ts`
- calendar history is derived from mutable `posts.publishedAt` and current post status:
  - `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/dashboard/calendar.ts`
- `posts` has no tombstone or archival fields:
  - `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/schema.ts`

This means:
- history can disappear from the calendar
- per-platform history can be rewritten by edits
- internal delete and external delete are conflated
- rollback is not a first-class product concept

## Design Goals

The new model must support:
- immutable history for sent and attempted posts
- rollback and restore without rewriting the past
- separate internal and external deletion state
- stable post identity across revisions
- per-target history that survives edits
- calendar/history driven by durable facts, not only live rows

The new model must not:
- hard-delete published posts
- null out publish timestamps to simulate deletion
- recreate per-target rows in a way that erases publish history
- use `pipeline_runs` as the only durable source of execution truth

## Target Model

### `posts`

Role:
- stable post identity

Recommended fields to add:
- `lifecycleStatus`
- `currentRevisionId`
- `firstPublishedAt`
- `latestPublishedAt`
- `archivedAt`
- `deletedInternalAt`
- `deletedExternalAt`
- `supersededByPostId`
- `rolledBackFromPostId`

Notes:
- keep existing `title`, `content`, `contentType`, and `mediaUrl` for compatibility during migration
- long-term, these become convenience mirrors of the current revision
- published posts are never hard-deleted through normal operator flows

Recommended lifecycle status set:
- `draft`
- `scheduled`
- `publishing`
- `published`
- `partial_failure`
- `failed`
- `archived`
- `deleted_internal`
- `deleted_external`
- `rolled_back`
- `superseded`

### `post_revisions`

Role:
- content snapshots across edits

Columns:
- `id`
- `postId`
- `workspaceId`
- `revisionNumber`
- `title`
- `content`
- `contentType`
- `mediaUrl`
- `metadataSnapshot`
- `createdByUserId`
- `createdAt`

Rules:
- every material edit creates a new revision row
- `posts.currentRevisionId` points to the active revision
- rollback creates a new revision or new post linked to the old one
- old revisions remain readable

### `post_targets`

Role:
- current routing intent for a post

Columns to keep:
- `id`
- `postId`
- `platformId`
- `status`
- `publishedUrl`
- `platformPostId`
- `error`
- `publishedAt`
- `createdAt`

Role boundary:
- this is the current assignment surface
- this is not the authoritative long-term history surface

Rules:
- updates should patch existing target rows where possible
- target removal should archive or tombstone the relationship, not erase historical sends

### `post_events`

Role:
- append-only lifecycle stream

Columns:
- `id`
- `workspaceId`
- `postId`
- `postRevisionId` nullable
- `postTargetId` nullable
- `pipelineRunId` nullable
- `eventType`
- `eventAt`
- `actorUserId` nullable
- `source`
- `payload`
- `dedupeKey` nullable

Recommended event types:
- `post_created`
- `post_updated`
- `revision_created`
- `post_scheduled`
- `post_unscheduled`
- `publish_started`
- `publish_succeeded`
- `publish_failed`
- `target_publish_started`
- `target_publish_succeeded`
- `target_publish_failed`
- `delete_internal_requested`
- `delete_internal_completed`
- `delete_external_requested`
- `delete_external_succeeded`
- `delete_external_failed`
- `delete_external_unsupported`
- `external_delete_detected`
- `post_archived`
- `post_restored`
- `post_rolled_back`
- `post_superseded`

Payload guidelines:
- include status snapshot
- include published URL and provider post ID when known
- include provider error payload summary when known
- include key content snapshot fields needed for audit and calendar/history

### Optional `post_target_events`

This is optional.

If `post_events.payload` stays disciplined, a separate `post_target_events` table is not required yet.

Use a dedicated table only if:
- target-level event volume becomes too high
- per-target analytics queries need tighter indexing
- one event stream becomes too noisy for product needs

## Delete Semantics

### Internal delete

Meaning:
- remove the post from active operator surfaces
- preserve historical record

Behavior:
- set `posts.lifecycleStatus = deleted_internal`
- set `posts.deletedInternalAt`
- write `delete_internal_requested` and `delete_internal_completed`
- do not null `firstPublishedAt` or `latestPublishedAt`
- do not hard-delete revisions or events

### External delete

Meaning:
- remove the post on the connected platform if supported

Behavior:
- issue provider delete per target
- record `delete_external_requested`
- for each target:
  - `delete_external_succeeded`
  - `delete_external_failed`
  - `delete_external_unsupported`
- if all published targets are deleted successfully:
  - set `posts.lifecycleStatus = deleted_external`
  - set `posts.deletedExternalAt`
- preserve internal publish timestamps and event history

Important:
- internal delete and external delete are different actions
- one can succeed while the other fails

## Rollback Semantics

Rollback does not mean mutating history.

Rollback means:
- preserve original post and event trail
- create a new operator artifact to replace or correct it

Allowed rollback shapes:
- create new revision for a draft/scheduled post
- create new post linked by `rolledBackFromPostId`
- mark old post `superseded`

Not allowed:
- clearing publish timestamps
- deleting old target history
- deleting old revisions

## Calendar And History Truth

### Calendar

Calendar should show:
- future scheduled work from current `posts` + `post_targets`
- historical artifacts from `posts` plus `post_events`
- execution detail from `pipeline_runs`

Calendar should not hide history when:
- a post is deleted internally
- a post is deleted externally
- a post is rolled back
- a target fails after another target succeeded

Recommended visual states:
- `Scheduled`
- `Published`
- `Partial`
- `Failed`
- `Deleted in app`
- `Deleted on network`
- `Rolled back`
- `Superseded`

### Posts list

Posts list should default to active records, but support:
- `Deleted`
- `Rolled back`
- `Superseded`
- `Archived`

### Activity and logs

Activity/log views should read durable lifecycle events, not synthesize the main truth from mutable `posts`.

`audit_events` and `activity_log` remain useful, but `post_events` should become the post-lifecycle source of truth.

## Why This Is Better

This architecture fixes the current failure modes:
- deleting a post does not erase history
- editing a post does not rewrite old platform outcomes
- calendar does not lose sent history when a row changes
- rollback creates lineage instead of mutating the past
- internal and external deletion become understandable and testable

It also matches how mature SaaS products handle sent history:
- immutable sent history
- soft delete for operator cleanup
- explicit external deletion state
- visible lifecycle events

## Minimum Viable Change Set

Phase 1 minimum:
- add tombstone fields to `posts`
- add `post_revisions`
- add `post_events`
- stop hard-deleting published posts
- stop recreating `post_targets` destructively
- preserve existing `publishedAt`

Phase 2:
- move calendar/history to lifecycle-aware reads
- expose deleted/rolled-back/superseded states in UI

Phase 3:
- make `posts` mostly an identity/current-state table and move history to revisions/events

## Non-Goals For This Slice

Not required in the first migration:
- full event-sourcing rewrite
- replacing `pipeline_runs`
- replacing `activity_log`
- moving from SQLite to Postgres
- building analytics on top of lifecycle events

## Acceptance Criteria

This architecture is landed when:
- deleting a published post no longer removes it from internal history
- editing a post no longer erases prior target publish metadata
- calendar can show historical deleted/rolled-back posts
- restore and rollback have explicit lineage
- lifecycle history can be reconstructed from durable tables alone
