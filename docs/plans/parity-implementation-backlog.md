# Parity Implementation Backlog

Last updated: 2026-04-13

## Purpose

Turn the parity plan into an execution sequence that can be implemented end-to-end without re-planning every week.

## Operating Rule

Do not start Milestone 2 until Milestone 1 exit criteria are satisfied.

Reason:
- this repo already proved that adding features on top of unstable publishing creates trust debt fast

## Milestone 0: Stabilize Core

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/phase-0-stabilization-checklist.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`

Build items:
- production auth gate
- scheduler reconciliation path
- manual/cron publish path unification
- status normalization
- capability gating for image vs video
- local/dev/prod parity fixes

Definition of done:
- all Phase 0 exit criteria met

## Milestone 1: Tenancy And Access

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/social-poster-target-schema-v1.md`

Build items:
- `users`
- `organizations`
- `workspaces`
- `roles`
- `workspace_members`
- `workspace_invitations`
- workspace-aware auth checks
- one default org/workspace seeded for current data

Definition of done:
- dashboard data loads through workspace context
- access control is no longer single-email only

## Milestone 2: Social Accounts

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/social-poster-target-schema-v1.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`

Build items:
- `social_accounts`
- `social_account_credentials`
- `social_account_capabilities`
- `social_account_health`
- account connect/edit/disconnect flows
- account enable/disable
- account health view
- publisher reads from new account model

Definition of done:
- `platforms` no longer needed for active publishing paths

## Milestone 3: Composer Foundations

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`

Build items:
- evolve `posts`
- add `post_variants`
- add `post_revisions`
- add categories/tags
- add draft form with per-platform copy
- add preview scaffolding

Definition of done:
- one draft can target X and LinkedIn with different copy

## Milestone 4: Media Library

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`

Build items:
- `media_assets`
- `media_asset_versions`
- `media_folders`
- `post_asset_links`
- asset upload/import and reuse
- alt-text support

Definition of done:
- posts no longer rely on one raw `mediaUrl` field

## Milestone 5: Calendar And Queues

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`

Build items:
- `publishing_queues`
- `posting_slots`
- `scheduled_publications`
- queue assignment flow
- calendar state rewrite
- cron worker becomes lower-level runner, not planning UX

Definition of done:
- operators plan from queues and slots, not cron rows

## Milestone 6: Publish Audit

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`

Build items:
- `publish_attempts`
- `publish_attempt_assets`
- `activity_log`
- dashboard attempt timeline
- normalized failure reason UI

Definition of done:
- operator can answer "what happened?" from the app

## Milestone 7: Approvals And Client Portal

Build items:
- approval request state
- internal comments
- approver role UX
- client review access
- approval-to-scheduled flow

Definition of done:
- draft can move from editor to approver to publish-ready

## Milestone 8: Inbox And Replies

Build items:
- inbox tables and ingestion
- operator-facing reply workflow
- reply engine integration with account model
- saved replies and notes

Definition of done:
- reply engine is not a sidecar; it is part of the product surface

## Milestone 9: Notifications

Build items:
- in-app notifications
- delivery preferences
- activity-driven alerts

Definition of done:
- key workflow changes generate visible operator notifications

## Milestone 10: Automation Reintegration

Build items:
- feed-to-draft pipeline
- OG-image-first candidate flow
- automated draft suggestions
- schedule recommendations
- optional auto-publish rules

Definition of done:
- the rebuilt product still keeps the automation edge over BrightBean

## Cross-Cutting Rules

### Testing

Every milestone should add:
- schema migration test or verification
- happy-path integration check
- failure-path check for the risky seam

### Docs

Update:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/tasks.md`

when a milestone changes the real baseline.

### Rollout

Follow:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/migration-and-rollout-runbook.md`

for all schema and provider changes.

## Suggested First Build Sprint

If starting immediately, do this sequence:
1. Milestone 0
2. Milestone 1 schema and auth changes
3. Milestone 2 account model
4. only then start composer work

That is the shortest path that removes the current structural blockers.
