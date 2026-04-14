# BrightBean Parity Feature Matrix

Last updated: 2026-04-13

## Purpose

Translate BrightBean Studio's surface area into an implementation map for `social-poster`.

Reference repo:
- `/Users/maxpetrusenko/Desktop/Projects/oss/brightbean-studio`

Reference in this repo:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-parity-handoff.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/db/schema.ts`

Status labels:
- `present`: usable today
- `partial`: exists, but too thin or unreliable
- `absent`: not built
- `rewrite`: exists, but wrong shape for parity target

## Summary

Core read:
- automation engine: stronger than BrightBean in some spots
- operations surface: far behind BrightBean
- parity blocker: current schema is single-admin + cron-row centric
- correct path: stabilize publishing first, then rebuild product surface around workspace/account/composer/calendar primitives

## Auth And Access

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Google sign-in / auth gate | `accounts` | `partial` | prod still depends on bypass/local auth paths | 0 | P0 | Must be reliable before any broader rollout |
| Organization model | `organizations` | `absent` | no tenant boundary | 1 | P0 | Needed for every later subsystem |
| Workspace model | `workspaces` | `absent` | no content/account isolation | 1 | P0 | Primary ownership boundary |
| Member roles | `members` | `absent` | no owner/admin/editor/approver/client model | 1 | P0 | Approval/client portal blocked without this |
| Invitations | `members`, `accounts` | `absent` | no way to onboard collaborators | 1 | P1 | Can land after core roles |
| Session governance | `accounts` | `partial` | sessions exist, but tied to simple email token flow | 1 | P1 | Replace ad hoc auth with workspace-aware auth |

## Social Accounts And Credentials

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Connected social accounts | `social_accounts` | `partial` | `platforms` table is too thin | 2 | P0 | Wrong abstraction today |
| Direct credential storage | `credentials` | `absent` | no first-class credential entity | 2 | P0 | Current provider config hidden in `platforms.config` |
| Account health / connection state | `social_accounts`, `publisher` | `absent` | no durable status, refresh, or token expiry tracking | 2 | P0 | Needed to debug publishing |
| Capability flags per account | `social_accounts` | `absent` | cannot distinguish image/video/reply/support cleanly | 2 | P1 | Important for account-specific UX |
| Rate limit state | `publisher` | `absent` | failures only visible in logs/errors | 5 | P1 | Helpful for X/LinkedIn debugging |
| Account test flow | `social_accounts`, `publisher` | `partial` | publishing is only practical connectivity check | 2 | P1 | Add explicit test/refresh paths |

## Composer

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Canonical draft object | `composer.Post` | `partial` | `posts` exists, but too shallow | 3 | P0 | Keep table name if convenient; expand meaning |
| Per-platform overrides | `composer.PlatformPost` | `absent` | one content body for all targets | 3 | P0 | Needed for real X/LinkedIn parity |
| Multiple assets per post | `composer.PostMedia` | `absent` | only one `mediaUrl` | 3 | P0 | Current model breaks carousels and reuse |
| Revision history | `composer.PostVersion` | `absent` | no edit history | 3 | P1 | Useful for approvals and audit |
| Templates | `composer.PostTemplate` | `absent` | no first-class template system | 3 | P2 | Nice leverage, not first blocker |
| Tags / categories | `composer.Tag`, `composer.ContentCategory` | `absent` | weak organization | 3 | P2 | Helps planning/search |
| Idea / feed intake | `composer.Idea`, `composer.Feed` | `partial` | candidate cache exists, but not integrated into composer model | 3 | P1 | Existing strength should be preserved |
| Platform previews | `composer` UI | `partial` | current manual form too thin | 3 | P1 | High UX value |

## Calendar And Scheduling

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Visual calendar | `calendar` | `partial` | page exists, but scheduler model is cron-first | 4 | P0 | Current UX lies about state too easily |
| Recurring slots | `calendar.PostingSlot`, `calendar.RecurrenceRule` | `absent` | only raw cron rows | 4 | P0 | Core parity requirement |
| Queues | `calendar.Queue`, `calendar.QueueEntry` | `absent` | no slot filling system | 4 | P0 | Needed for agency workflow |
| Drag/drop planning | `calendar` UI | `absent` | manual scheduling only | 4 | P1 | UX layer after data model |
| Scheduled vs draft vs published clarity | `calendar`, `composer`, `publisher` | `partial` | state split is muddy | 4 | P0 | Current confusion causes trust issues |
| Worker schedule runtime sync | `publisher` | `rewrite` | DB enable/disable drifted from runtime | 0 | P0 | Must be fixed before more features |

## Publishing And Audit

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Publish attempt history | `publisher.PublishLog` | `partial` | `pipeline_runs` tracks runs, not platform-grade attempts | 5 | P0 | Separate content workflow from delivery log |
| Per-platform delivery record | `publisher` | `partial` | `post_targets` is too thin | 5 | P0 | Needs request/response history |
| Retry tracking | `publisher` | `partial` | ad hoc, not modeled clearly | 5 | P1 | Useful for manual recovery |
| Failure reason visibility | `publisher` | `partial` | some error strings, weak normalization | 5 | P0 | Operator must answer "why failed?" fast |
| Provider abstraction | `publisher`, `social_accounts` | `rewrite` | cron/manual paths drifted across providers | 0, 2, 5 | P0 | One publishing contract only |
| Publish provenance | `publisher` | `partial` | run trigger exists, but limited audit trail | 5 | P1 | Track manual vs scheduled vs automated |

## Approvals And Client Portal

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Approval workflow | `approvals` | `absent` | no approval state machine | 6 | P1 | Big parity gap |
| Internal comments on posts | `approvals.PostComment` | `absent` | no collaboration notes | 6 | P1 | Needed before client review |
| Approval reminders | `approvals.ApprovalReminder` | `absent` | no follow-up loop | 6 | P2 | Second wave |
| Client access links | `client_portal.MagicLinkToken` | `absent` | no external review experience | 6 | P1 | Distinct from staff auth |
| Client-facing portal | `client_portal` | `absent` | no external approvals surface | 6 | P1 | Major workflow unlock |

## Media Library

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Managed asset library | `media_library.MediaAsset` | `absent` | media only lives as URL strings | 7 | P1 | Big gap |
| Folders | `media_library.MediaFolder` | `absent` | no organization | 7 | P2 | Optional for MVP parity |
| Asset versions / derivatives | `media_library.MediaAssetVersion` | `absent` | no rendition/crop model | 7 | P2 | Helpful for platform formatting |
| Alt text / metadata | `media_library` | `partial` | no central metadata record | 7 | P1 | Important for X/LinkedIn quality |
| Reuse across posts | `media_library`, `composer` | `absent` | each post carries a raw URL | 7 | P1 | Needed before teams scale |

## Inbox And Engagement

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Unified inbox | `inbox` | `absent` | only reply engine logs | 8 | P1 | Major parity gap |
| Message ingestion | `inbox.InboxMessage` | `absent` | no durable conversation model | 8 | P1 | Foundation for replies/assignments |
| Draft replies | `inbox.InboxReply`, `SavedReply` | `partial` | AI reply engine exists, but not operator-facing | 8 | P1 | Existing strength can accelerate this |
| Internal notes | `inbox.InternalNote` | `absent` | no team collaboration | 8 | P2 | Needed for agency workflow |
| SLA / routing config | `inbox.InboxSLAConfig` | `absent` | no response ops layer | 8 | P3 | Later-stage operations polish |

## Notifications And Activity

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| In-app notifications | `notifications.Notification` | `absent` | no operator alerts | 9 | P2 | Useful after approvals/inbox |
| Notification preferences | `notifications.NotificationPreference` | `absent` | no routing controls | 9 | P3 | Secondary |
| Delivery tracking | `notifications.NotificationDelivery` | `absent` | no audit for alerts | 9 | P3 | Secondary |
| Quiet hours / routing windows | `notifications.QuietHours` | `absent` | no noise control | 9 | P3 | Later |
| Global activity log | multiple apps | `absent` | no unified audit stream | 5, 9 | P1 | Start early even if UI comes later |

## Automation And AI Layer

| Capability | BrightBean reference | `social-poster` now | Gap | Target phase | Priority | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Feed candidate ingestion | BrightBean weaker here | `present` | current edge, but disconnected from composer/calendar | 3, 10 | P1 | Preserve and integrate |
| AI draft suggestions | BrightBean weaker here | `partial` | drafts exist, but quality/control inconsistent | 3, 10 | P1 | Tighten with composer surface |
| OG-image-first news intake | not core BrightBean surface | `partial` | candidate path exists, but manual flow needs polish | 3 | P2 | Keep as differentiated workflow |
| Automated reply engine | not core BrightBean surface | `present` | useful, but isolated from inbox model | 8, 10 | P1 | Integrate into engagement layer |
| Render/generate hooks | not core BrightBean surface | `partial` | useful, but not modeled as first-class asset pipeline | 7, 10 | P2 | Add after media foundations |

## Build Order

Recommended order:
1. Stabilize auth, runtime scheduler, manual publish, status correctness
2. Add org/workspace/member foundations
3. Add social account + credential model
4. Expand composer into real draft/variant/asset model
5. Replace cron-first planning with slots + queues + clearer calendar state
6. Add publish audit and activity log
7. Add approvals + client portal
8. Add media library
9. Add inbox + operator-facing replies
10. Add notifications
11. Reintegrate automation strengths on top of the new surface

## Non-Goals

Do not do these early:
- copy AGPL code blindly from BrightBean
- chase inbox/portal polish before publishing is stable
- build calendar drag/drop on top of the current cron-row schema
- keep adding features to `platforms.config` instead of introducing proper account tables
