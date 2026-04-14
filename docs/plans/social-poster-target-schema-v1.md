# Social Agent Target Schema V1

Last updated: 2026-04-13

## Purpose

Define the target data model for Phase 1 and Phase 2 of the BrightBean parity plan.

Scope:
- tenancy
- auth boundary
- workspace membership
- social accounts
- credentials
- account capability and health metadata

Out of scope for this version:
- full composer rebuild
- approvals
- client portal
- inbox
- media library
- notifications

Reference files:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/schema.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-parity-handoff.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-parity-feature-matrix.md`

## Current Schema Problem

Current shape:
- `sessions`
- `magic_links`
- `platforms`
- `profiles`
- `posts`
- `post_targets`
- `schedules`
- `pipeline_runs`
- `reply_events`
- `dedup_cache`
- `candidate_cache`

Main issue:
- the schema is single-admin and provider-centric
- there is no workspace boundary
- `platforms` mixes account identity, provider config, and capability assumptions
- later features have nowhere clean to attach

## Design Principles

1. Workspace ownership first
Every durable business object should belong to a workspace directly or through a clear parent.

2. Separate auth from business membership
Identity/session records are not enough. Membership and role assignment must be explicit.

3. Separate social account identity from credentials
The account object should describe what the connected account is. Credentials should describe how to access it.

4. Additive migration
Do not rewrite the whole schema in one shot. Add new tables, backfill one default org/workspace, then move reads and writes gradually.

5. Preserve current publishing tables temporarily
`posts`, `post_targets`, `schedules`, and `pipeline_runs` can survive Phase 1 and 2 if they gain workspace/account linkage later.

## Phase 1 Tables

### `organizations`

Purpose:
- top-level tenant boundary

Key columns:
- `id`
- `name`
- `slug`
- `owner_user_id`
- `created_at`
- `updated_at`

Notes:
- start with one organization for Max
- keep slug unique

### `users`

Purpose:
- canonical signed-in identity

Key columns:
- `id`
- `email`
- `full_name`
- `avatar_url`
- `auth_provider`
- `provider_user_id`
- `last_seen_at`
- `created_at`
- `updated_at`

Notes:
- local session rows can continue short-term, but should reference `users`
- if Supabase auth lands, map identities into this table

### `workspaces`

Purpose:
- primary ownership boundary for social accounts, posts, schedules, and assets

Key columns:
- `id`
- `organization_id`
- `name`
- `slug`
- `timezone`
- `default_profile_id` nullable
- `created_at`
- `updated_at`

Notes:
- one organization can own many workspaces
- timezone belongs here, not inside scattered cron metadata

### `roles`

Purpose:
- explicit role catalog

Key columns:
- `id`
- `organization_id` nullable
- `workspace_id` nullable
- `name`
- `scope`
- `permissions_json`
- `system`
- `created_at`
- `updated_at`

Notes:
- start with system roles:
  - owner
  - admin
  - editor
  - approver
  - client
- later custom roles can reuse the same table

### `workspace_members`

Purpose:
- map users into workspaces with clear access

Key columns:
- `id`
- `workspace_id`
- `user_id`
- `role_id`
- `status`
- `invited_by_user_id`
- `joined_at`
- `created_at`
- `updated_at`

Notes:
- status examples: `invited`, `active`, `disabled`
- all dashboard access checks should eventually route through this table

### `workspace_invitations`

Purpose:
- invite collaborators or clients

Key columns:
- `id`
- `workspace_id`
- `email`
- `role_id`
- `token`
- `invited_by_user_id`
- `expires_at`
- `accepted_at`
- `created_at`

Notes:
- can coexist with current magic-link flow at first
- this is membership onboarding, not login session storage

### `workspace_settings`

Purpose:
- keep workspace-level operational settings out of ad hoc config blobs

Key columns:
- `workspace_id`
- `default_timezone`
- `branding_json`
- `posting_defaults_json`
- `feature_flags_json`
- `created_at`
- `updated_at`

Notes:
- optional in initial migration, but useful early
- better than stuffing future flags into unrelated tables

## Phase 2 Tables

### `social_accounts`

Purpose:
- represent connected publishing accounts in a workspace

Key columns:
- `id`
- `workspace_id`
- `platform`
- `account_type`
- `display_name`
- `handle`
- `external_account_id`
- `avatar_url`
- `status`
- `provider`
- `connected_at`
- `last_checked_at`
- `last_error`
- `created_at`
- `updated_at`

Notes:
- replaces most of current `platforms`
- examples:
  - `platform = twitter`
  - `platform = linkedin`
  - `account_type = person`, `page`, `company`
- `provider` can still be `late`, `bird`, `direct`, or similar, but only as delivery mechanism metadata

### `social_account_credentials`

Purpose:
- store how to authenticate against the account/provider

Key columns:
- `id`
- `social_account_id`
- `credential_type`
- `provider`
- `encrypted_secret_ref`
- `token_preview`
- `scopes_json`
- `expires_at`
- `refresh_after`
- `last_refreshed_at`
- `status`
- `created_at`
- `updated_at`

Notes:
- do not keep raw long-lived secrets in generic JSON blobs
- `encrypted_secret_ref` should point to encrypted storage or secret manager material
- one social account may have multiple credential rows over time

### `social_account_capabilities`

Purpose:
- explicit machine-readable publish and engagement support

Key columns:
- `social_account_id`
- `can_publish_text`
- `can_publish_image`
- `can_publish_video`
- `can_publish_reply`
- `can_schedule`
- `can_read_inbox`
- `can_use_og_image`
- `max_media_count`
- `metadata_json`
- `updated_at`

Notes:
- removes implicit assumptions from application code
- supports user request like "enable image posts only, not video"

### `social_account_health`

Purpose:
- operational status and health snapshots

Key columns:
- `social_account_id`
- `connection_status`
- `last_successful_publish_at`
- `last_failed_publish_at`
- `last_failure_code`
- `last_failure_message`
- `rate_limit_json`
- `health_checked_at`
- `updated_at`

Notes:
- may later merge into account status tables if that proves simpler
- useful for dashboard diagnostics before full audit layer exists

### `social_account_labels`

Purpose:
- optional grouping and targeting metadata

Key columns:
- `id`
- `workspace_id`
- `name`
- `color`
- `created_at`

Related join:
- `social_account_label_assignments`

Notes:
- optional, but useful once a workspace has many accounts
- can wait until after the first connection flows work

## Existing Tables: Keep, Change, Or Retire

### Keep for now

Keep during Phase 1 and 2:
- `posts`
- `post_targets`
- `schedules`
- `pipeline_runs`
- `reply_events`
- `dedup_cache`
- `candidate_cache`

Reason:
- these support current product behavior
- forcing a composer rewrite at the same time would slow stabilization

### Change soon

#### `sessions`

Keep short-term, but target shape becomes:
- `sessions.user_id`
- session handling backed by real `users`

#### `magic_links`

Keep only as transitional auth support.

Likely future:
- login callback or Supabase session replaces most of it
- invitations move to `workspace_invitations`

#### `platforms`

Do not keep as the long-term account model.

Migration target:
- `platforms` -> `social_accounts`
- provider/config details -> `social_account_credentials`
- booleans/feature assumptions -> `social_account_capabilities`
- health fields/errors -> `social_account_health`

#### `profiles`

Possible futures:
- keep as workspace brand/persona profile
- or fold parts into workspace settings and later composer defaults

Recommendation:
- keep for now
- add `workspace_id` later
- do not expand it further until composer direction is clearer

## Suggested Foreign-Key Direction

Phase 1:
- `workspaces.organization_id -> organizations.id`
- `workspace_members.workspace_id -> workspaces.id`
- `workspace_members.user_id -> users.id`
- `workspace_members.role_id -> roles.id`
- `workspace_invitations.workspace_id -> workspaces.id`
- `workspace_settings.workspace_id -> workspaces.id`

Phase 2:
- `social_accounts.workspace_id -> workspaces.id`
- `social_account_credentials.social_account_id -> social_accounts.id`
- `social_account_capabilities.social_account_id -> social_accounts.id`
- `social_account_health.social_account_id -> social_accounts.id`

Later backfills:
- `posts.workspace_id -> workspaces.id`
- `posts.created_by_user_id -> users.id`
- `post_targets.social_account_id -> social_accounts.id`
- `schedules.workspace_id -> workspaces.id`
- `schedules.created_by_user_id -> users.id`
- `reply_events.social_account_id -> social_accounts.id`

## Migration Plan

### Step 1. Add new tables only

Do not break current reads.

Add:
- `users`
- `organizations`
- `workspaces`
- `roles`
- `workspace_members`
- `workspace_invitations`
- `workspace_settings`
- `social_accounts`
- `social_account_credentials`
- `social_account_capabilities`
- `social_account_health`

### Step 2. Seed default tenant

Backfill one default set:
- one `organization`
- one `workspace`
- one `owner` user
- one `workspace_member`

### Step 3. Mirror current accounts

For each current `platforms` row:
- create one `social_accounts` row
- create one credential row if config exists
- create one capability row using current known behavior
- create one health row with best-effort last status

### Step 4. Move reads

Shift these paths first:
- dashboard connected accounts view
- enable/disable controls
- publish capability checks
- health/status views

### Step 5. Move writes

Shift these paths next:
- account connect/disconnect
- account update
- account enable/disable
- publisher account lookup

### Step 6. Add workspace linkage to old content tables

After new account model is stable:
- add `workspace_id` to `posts`
- add `workspace_id` to `schedules`
- add `social_account_id` to `post_targets`

### Step 7. Decommission `platforms`

Only after:
- no reads depend on it
- no writes depend on it
- publisher path no longer consults it

## What Not To Do

Avoid:
- stuffing new credential fields into `platforms.config`
- rebuilding composer before workspace/account foundations exist
- skipping `users` and trying to use email strings as the long-term identity key
- hiding capability flags in code branches instead of tables
- making prod-only account fixes that cannot run in local/dev with the same env model

## Immediate Follow-Up After V1

Next schema doc should cover:
- composer tables
- post variants
- post assets
- calendar slots and queues
- publish attempts and activity log
