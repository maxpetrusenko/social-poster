# Notifications And Activity Parity

Last updated: 2026-04-13

## Purpose

Define the next observable system after publish audit: a global activity log, in-app notifications, delivery records, and preference-based routing.

Scope:
- global activity log
- in-app notifications
- delivery records
- preferences
- quiet hours and routing
- event taxonomy
- schema suggestions
- rollout order
- definition of done

Depends on:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/parity-implementation-backlog.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/migration-and-rollout-runbook.md`

## Problem

Today, important product state is visible only in fragments:
- dashboard summaries
- publish attempt tables
- scheduler state
- raw logs
- ad hoc UI badges

Missing pieces:
- one workspace-wide activity timeline
- user-level unread state
- durable notification delivery attempts
- preference and quiet-hours policy
- routing by role, relation, and severity

## Design Rules

- one event, many consumers
- event first, delivery second
- audit data must survive notification suppression
- quiet hours affect delivery, not event creation
- workspace scope is default
- critical events may bypass quiet hours
- dedupe must prevent repeated noise from the same source event

## Suggested Schema

### `activity_log`

Role:
- immutable source of truth for product and system events

Suggested columns:
- `id`
- `workspace_id`
- `actor_user_id` nullable
- `event_type`
- `severity`
- `entity_type`
- `entity_id`
- `subject`
- `body`
- `metadata_json`
- `correlation_id` nullable
- `dedupe_key` nullable
- `source`
- `created_at`

Notes:
- append only
- used for global feed, audit, and notification fanout
- should not store read or delivery state

### `notifications`

Role:
- per-recipient materialization of an activity event

Suggested columns:
- `id`
- `workspace_id`
- `activity_log_id`
- `recipient_user_id`
- `channel`
- `title`
- `body`
- `severity`
- `status`
- `read_at` nullable
- `dismissed_at` nullable
- `created_at`
- `updated_at`

Notes:
- this is the in-app surface
- one activity event can produce many notifications
- user state lives here, not in `activity_log`

### `notification_deliveries`

Role:
- channel-specific attempt history

Suggested columns:
- `id`
- `notification_id`
- `channel`
- `provider`
- `status`
- `attempt_count`
- `external_message_id` nullable
- `error_classification` nullable
- `error_message` nullable
- `sent_at` nullable
- `delivered_at` nullable
- `failed_at` nullable
- `next_retry_at` nullable
- `metadata_json`
- `created_at`

Notes:
- keep every attempt traceable
- do not collapse retries into one opaque row
- preserve raw provider details for debugging

### `notification_preferences`

Role:
- user-level and workspace-level delivery policy

Suggested columns:
- `id`
- `workspace_id`
- `user_id`
- `channel`
- `enabled`
- `severity_threshold`
- `quiet_hours_start` nullable
- `quiet_hours_end` nullable
- `quiet_hours_timezone` nullable
- `digest_mode`
- `routing_json`
- `created_at`
- `updated_at`

Notes:
- preferences should be explicit, not inferred from UI state
- quiet hours need timezone ownership, usually workspace timezone with user override
- digest mode should be able to delay noncritical items without losing them

## Event Taxonomy

### Content Events

- `post.created`
- `post.updated`
- `post.scheduled`
- `post.published`
- `post.partial_failure`
- `post.failed`
- `post.archived`

### Account And Provider Events

- `account.connected`
- `account.updated`
- `account.disabled`
- `account.reenabled`
- `account.health_changed`
- `credential.expiring`
- `credential.refresh_failed`

### Planning And Calendar Events

- `schedule.created`
- `schedule.updated`
- `schedule.enabled`
- `schedule.disabled`
- `queue.assigned`
- `slot.reserved`
- `slot.missed`

### Collaboration Events

- `approval.requested`
- `approval.granted`
- `approval.rejected`
- `comment.added`
- `assignment.changed`
- `mention.created`

### System Events

- `auth.login_failed`
- `auth.access_blocked`
- `automation.candidate_created`
- `automation.rule_triggered`
- `import.completed`
- `integration.error`

## Routing And Quiet Hours

Routing should be computed from four inputs:
- event severity
- recipient relation to the entity
- user and workspace preferences
- quiet-hours window

Suggested routing order:
- always create `activity_log`
- create in-app `notifications` for eligible recipients
- create delivery rows for each enabled external channel
- suppress or defer only the delivery step, never the event

Suggested recipient rules:
- owner and assignee get direct workflow events
- approvers get approval events
- admins get system and policy events
- watchers get comment and mention events
- clients only get workspace-approved review events

Suggested quiet-hours rules:
- noncritical events queue for the next allowed window
- critical failures may bypass quiet hours
- digestable events can batch into a summary
- unread in-app state still updates immediately

Suggested delivery classes:
- immediate
- deferred
- digest
- suppressed
- failed

## Rollout Order

1. Add `activity_log` writes to the highest-value existing actions.
2. Surface a global activity feed in the dashboard.
3. Add `notifications` and unread state for in-app alerts.
4. Add `notification_deliveries` for channel attempts and retries.
5. Add `notification_preferences` with workspace and user overrides.
6. Add quiet-hours routing and digest batching.
7. Backfill a small safe window of historical events if the source data is reliable.
8. Wire new milestones to emit events by default, not as a follow-up.

## Definition Of Done

This work is done when:
- every user-visible workflow writes a durable activity event
- the dashboard shows a workspace-wide feed with filters
- users can mark notifications read or dismiss them
- delivery attempts are traceable per channel
- preferences and quiet hours change delivery behavior predictably
- critical events remain visible even when delivery is deferred
- routing is testable without reading raw logs
- the schema is ready for later inbox and notification expansion

## Implementation Notes

- start with append-only event capture
- keep notification fanout derived from the event log
- avoid baking channel logic into business tables
- do not make suppression destructive
- keep this layer workspace-scoped so later multi-tenant inbox work can reuse it
