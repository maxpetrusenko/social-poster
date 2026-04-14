# Composer And Calendar Schema V2

Last updated: 2026-04-13

## Purpose

Define the next schema layer after tenancy and social accounts.

This document covers:
- composer data model
- media model
- queue and slot model
- scheduling state
- publish audit model

Depends on:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/social-poster-target-schema-v1.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`

## Design Goals

The schema must support:
- one draft targeting many accounts
- per-platform copy differences
- multiple media assets
- visual planning by slot and queue
- publish auditing separate from content authoring
- future approvals and client review

The schema must not depend on:
- raw cron rows as the main planning primitive
- one `mediaUrl` per post
- one content body for every platform

## Core Content Tables

### `posts`

Role:
- canonical content object

Add or redefine fields:
- `id`
- `workspace_id`
- `created_by_user_id`
- `title`
- `status`
- `content_source`
- `primary_variant_id` nullable
- `source_url` nullable
- `source_title` nullable
- `content_category_id` nullable
- `metadata_json`
- `created_at`
- `updated_at`
- `published_at` nullable

Recommended post status set:
- `draft`
- `ready`
- `scheduled`
- `in_review`
- `approved`
- `publishing`
- `published`
- `partial_failure`
- `failed`
- `archived`

Note:
- existing `posts` table can be evolved rather than replaced

### `post_variants`

Role:
- platform or account-specific copy/render variations

Key columns:
- `id`
- `post_id`
- `workspace_id`
- `platform`
- `social_account_id` nullable
- `body`
- `headline` nullable
- `cta_text` nullable
- `status`
- `is_primary`
- `char_count`
- `metadata_json`
- `created_at`
- `updated_at`

Rule:
- one post can have many variants
- default variant may target all compatible accounts unless overridden

### `post_revisions`

Role:
- lightweight version history

Key columns:
- `id`
- `post_id`
- `post_variant_id` nullable
- `edited_by_user_id`
- `snapshot_json`
- `change_summary`
- `created_at`

### `content_categories`

Role:
- editorial grouping

Key columns:
- `id`
- `workspace_id`
- `name`
- `slug`
- `color`
- `created_at`

### `tags`

Role:
- ad hoc labeling

Key columns:
- `id`
- `workspace_id`
- `name`
- `slug`
- `created_at`

Related join:
- `post_tag_assignments`

## Media Tables

### `media_assets`

Role:
- managed asset library item

Key columns:
- `id`
- `workspace_id`
- `folder_id` nullable
- `kind`
- `source_url`
- `storage_key` nullable
- `filename`
- `mime_type`
- `width` nullable
- `height` nullable
- `duration_ms` nullable
- `file_size_bytes` nullable
- `alt_text` nullable
- `created_by_user_id`
- `created_at`
- `updated_at`

### `media_folders`

Role:
- optional organization layer

Key columns:
- `id`
- `workspace_id`
- `name`
- `parent_id` nullable
- `created_at`

### `media_asset_versions`

Role:
- derivative or processed forms

Key columns:
- `id`
- `media_asset_id`
- `version_type`
- `source_url`
- `storage_key` nullable
- `width` nullable
- `height` nullable
- `duration_ms` nullable
- `metadata_json`
- `created_at`

Examples:
- square crop
- LinkedIn crop
- GIF export
- compressed MP4

### `post_asset_links`

Role:
- attach many assets to posts and variants

Key columns:
- `id`
- `post_id`
- `post_variant_id` nullable
- `media_asset_id`
- `sort_order`
- `role`
- `created_at`

Examples for `role`:
- `primary`
- `attachment`
- `thumbnail`

## Planning Tables

### `publishing_queues`

Role:
- named workflow lanes

Key columns:
- `id`
- `workspace_id`
- `name`
- `platform_scope`
- `is_active`
- `default_timezone`
- `created_at`
- `updated_at`

Examples:
- X main queue
- LinkedIn queue
- Image posts
- Client A approvals queue

### `queue_rules`

Role:
- optional assignment/default behavior

Key columns:
- `id`
- `queue_id`
- `content_category_id` nullable
- `preferred_platform`
- `preferred_social_account_id` nullable
- `preferred_media_kind` nullable
- `rule_json`
- `created_at`

### `posting_slots`

Role:
- recurring scheduling slots

Key columns:
- `id`
- `queue_id`
- `name`
- `weekday`
- `hour`
- `minute`
- `timezone`
- `target_platform`
- `target_social_account_id` nullable
- `media_policy`
- `is_active`
- `created_at`
- `updated_at`

Examples for `media_policy`:
- `image_only`
- `video_only`
- `image_or_video`
- `text_only`

### `scheduled_publications`

Role:
- concrete assignment of a post or variant to a future slot/time

Key columns:
- `id`
- `workspace_id`
- `post_id`
- `post_variant_id` nullable
- `queue_id` nullable
- `posting_slot_id` nullable
- `social_account_id`
- `scheduled_for`
- `status`
- `scheduled_by_user_id`
- `locked_at` nullable
- `published_at` nullable
- `created_at`
- `updated_at`

Recommended status set:
- `scheduled`
- `queued`
- `ready_to_publish`
- `publishing`
- `published`
- `failed`
- `canceled`

### `calendar_events`

Role:
- derived UI model if needed later

Note:
- optional
- do not store if the UI can derive cleanly from slots plus scheduled publications plus publish history

## Publish Audit Tables

### `publish_attempts`

Role:
- immutable audit row for each publish try

Key columns:
- `id`
- `workspace_id`
- `post_id`
- `post_variant_id` nullable
- `scheduled_publication_id` nullable
- `social_account_id`
- `provider`
- `trigger`
- `status`
- `classification`
- `message` nullable
- `external_post_id` nullable
- `external_post_url` nullable
- `external_request_id` nullable
- `raw_response_json` nullable
- `started_at`
- `completed_at` nullable
- `created_at`

Recommended status set:
- `running`
- `completed`
- `failed`

Classification should follow the provider architecture doc.

### `publish_attempt_assets`

Role:
- record what exact assets were sent

Key columns:
- `id`
- `publish_attempt_id`
- `media_asset_id`
- `media_asset_version_id` nullable
- `created_at`

### `activity_log`

Role:
- human-readable audit stream across the app

Key columns:
- `id`
- `workspace_id`
- `actor_user_id` nullable
- `entity_type`
- `entity_id`
- `action`
- `summary`
- `metadata_json`
- `created_at`

Examples:
- post created
- variant edited
- slot disabled
- social account disconnected
- publish failed
- approval requested

## State Rules

### Content state

`posts.status` is editorial state.

It should answer:
- is this draft ready
- is this under review
- is this scheduled
- has this been published at least once

### Delivery state

`scheduled_publications.status` is dispatch state.

It should answer:
- is this queued
- is it about to publish
- did the concrete dispatch succeed

### Attempt state

`publish_attempts.status` is transport state.

It should answer:
- did this exact provider call succeed
- if not, why

Do not collapse these three layers into one status column.

## Mapping From Current Tables

### Evolve

- `posts`
  - keep table name
  - add workspace/editorial fields
  - stop treating one row as one provider-ready payload

### Replace

- `post_targets`
  - long-term replacement is:
    - `post_variants`
    - `scheduled_publications`
    - `publish_attempts`

- `schedules`
  - long-term replacement for planning is:
    - `publishing_queues`
    - `posting_slots`

### Keep For Internal Worker Logs

- `pipeline_runs`
  - may remain for orchestration-level runs
  - should not be the only audit model for content delivery

## Build Order

1. add schema v1
2. add `posts.workspace_id`
3. add `post_variants`
4. add `media_assets` and `post_asset_links`
5. add `publishing_queues` and `posting_slots`
6. add `scheduled_publications`
7. add `publish_attempts`
8. move UI and workers gradually

## Definition Of Done

Schema v2 is ready when:
- one post can target multiple accounts cleanly
- one post can hold multiple assets
- scheduling no longer depends on raw cron rows as the main UX model
- publish auditing is separate from editorial state
