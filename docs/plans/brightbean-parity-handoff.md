# BrightBean Parity Handoff Plan

Last updated: 2026-04-13

## Goal

Bring `social-poster` to practical feature and workflow parity with BrightBean Studio while preserving the parts that are uniquely valuable in this repo:

- feed-driven post discovery
- AI-assisted drafting
- scheduled automation pipeline
- reply engine
- render/generate hooks

Reference repo:
- `/Users/maxpetrusenko/Desktop/Projects/oss/brightbean-studio`

Reference scope from BrightBean:
- multi-workspace teams
- richer composer
- recurring calendar and queues
- approvals
- client portal
- unified inbox
- media library
- notifications
- direct platform credentials
- audit-friendly publishing engine

## Constraint

BrightBean Studio is licensed `AGPL-3.0`.

Implication:
- use BrightBean as product and architecture reference
- do not copy code blindly into `social-poster`
- if direct code reuse is desired later, make an explicit licensing decision first

Default recommendation:
- reimplement behavior
- do not copy code

## Current State

`social-poster` today is:
- Next.js 15
- Tailwind 4
- TypeScript
- Drizzle + SQLite
- single-admin oriented
- automation-first

It already has:
- dashboard shell
- schedules
- posts
- pipeline runs
- reply engine
- platform rows
- profile rows
- manual publishing path

It does not yet have:
- org/workspace/member model
- robust account credential management
- first-class composer
- media library
- approval workflows
- client portal
- inbox
- notifications
- audit-grade publish history
- queue-based calendar workflow

## BrightBean Surface Map

BrightBean app modules:
- `accounts`
- `approvals`
- `calendar`
- `client_portal`
- `composer`
- `credentials`
- `inbox`
- `media_library`
- `members`
- `notifications`
- `organizations`
- `publisher`
- `settings_manager`
- `social_accounts`
- `workspaces`

Equivalent target areas for `social-poster`:
- auth + access
- organizations + workspaces + members
- social accounts + credentials
- composer + posts + variants
- calendar + queues + scheduling
- publisher + publish attempts + audit log
- approvals + client review
- inbox + reply workflows
- media library
- notifications
- settings + branding

## Product Direction

Do not aim for exact product cloning.

Target instead:
- BrightBean-level operations surface
- plus stronger automation and agentic workflows

Desired positioning:
- BrightBean parity for serious social ops
- better automation, drafting, and feed-to-post loop than BrightBean

## Migration Strategy

Do this in layers.

### Phase 0. Stabilize Core

Do not build parity on top of unreliable posting.

Must be true first:
- auth works in prod
- manual publish works reliably
- scheduled publish works reliably
- runtime scheduler state matches DB state
- post status reporting is trustworthy
- platform account config is explicit and testable

Exit criteria:
- X and LinkedIn image posting stable
- dashboard reflects real run state
- auth no longer bypassed in prod

### Phase 1. Replace Single-User Data Model

Add core tenancy model:
- `organizations`
- `workspaces`
- `members`
- `roles`
- `invitations`

Current single-profile model is too narrow for parity.

Target access model:
- owner
- admin
- editor
- approver
- client

Exit criteria:
- every major object belongs to a workspace
- access checks use workspace membership, not single-email assumptions

### Phase 2. Rebuild Social Account Layer

Current `platforms` table is too light.

Add:
- per-workspace social accounts
- platform type + sub-type
- first-party credential storage
- account health/status
- capability flags
- rate-limit state
- token refresh metadata

Target model:
- workspace
- many social accounts
- each account has credentials and publish capabilities

Exit criteria:
- connect/disconnect flow exists
- accounts have real capability metadata
- publisher reads from account credentials, not hardcoded/global provider config

### Phase 3. Rebuild Composer

Current post form is not enough.

Need:
- canonical post draft
- per-platform overrides
- multi-asset attachments
- preview by platform
- categories/tags
- templates
- revision history
- reusable defaults

Suggested entities:
- `posts`
- `post_variants`
- `post_assets`
- `post_templates`
- `post_labels`
- `post_revisions`

Exit criteria:
- one draft can target multiple accounts with overrides
- operator can preview and edit before publish

### Phase 4. Rebuild Calendar and Scheduling

Current cron-row model is too primitive.

Need:
- visual calendar
- recurring slots
- named queues
- queue assignment rules
- drag/drop planning
- next-slot assignment
- scheduled vs draft vs published state clarity

Suggested entities:
- `publishing_slots`
- `publishing_queues`
- `queue_assignments`
- `scheduled_posts`

Keep cron for low-level automation workers, but not as the main UX primitive.

Exit criteria:
- operator plans content from calendar, not raw cron strings
- recurring schedule surface matches BrightBean-level usability

### Phase 5. Add Publish Audit Layer

Current pipeline history is useful but not enough for parity.

Need:
- publish attempt history
- platform response tracking
- retry tracking
- per-account rate limit signals
- delivery audit log
- operator-visible failure reasons

Suggested entities:
- `publish_attempts`
- `publish_deliveries`
- `account_rate_limits`
- `activity_log`

Exit criteria:
- every publish is auditable
- operators can answer “what happened” without reading raw logs

### Phase 6. Add Approval Workflows

Need:
- approval stage config
- internal review
- client review
- comments on draft
- approval requests
- approval reminders
- audit trail

Suggested entities:
- `approval_policies`
- `approval_requests`
- `approval_comments`
- `approval_decisions`

Exit criteria:
- post can require approval before publish
- workspace can support internal and client approval paths

### Phase 7. Add Client Portal

Need:
- external client access
- magic-link access
- restricted permissions
- approve/reject/comment

This should not expose full dashboard.

Exit criteria:
- client can review assigned content safely
- client session is scoped and revocable

### Phase 8. Add Media Library

Current `mediaUrl` field is not a media system.

Need:
- uploaded assets
- foldering
- workspace scoping
- metadata
- alt text
- derived variants
- asset reuse across posts

Suggested entities:
- `media_assets`
- `media_folders`
- `media_variants`
- `media_usage`

Exit criteria:
- operators choose from a media library
- publish pipeline consumes managed assets, not ad hoc URLs

### Phase 9. Add Inbox

Need:
- mentions
- comments
- DMs where allowed
- assignments
- reply state
- historical sync

This is a real subsystem. Do not hide it under the current reply engine.

Suggested entities:
- `inbox_threads`
- `inbox_messages`
- `inbox_assignments`
- `inbox_actions`

Exit criteria:
- dashboard can manage inbound conversations
- reply workflows no longer live only in automation logs

### Phase 10. Add Notifications

Need:
- in-app notifications
- email notifications
- webhook hooks later
- user preferences

Suggested entities:
- `notifications`
- `notification_preferences`
- `notification_deliveries`

Exit criteria:
- major operational events create visible notifications

### Phase 11. Reintegrate Automation as the Differentiator

After operational parity exists, fold back in the parts that should beat BrightBean:

- feed candidate discovery
- OG-image candidate prefills
- AI draft suggestions
- auto-reply engine
- publish-time assistance
- schedule recommendations

These should sit on top of the new product surface, not beside it.

Exit criteria:
- automation feels native to the product
- operator can accept, edit, or reject AI suggestions inside normal workflows

## Schema Direction

High-level target schema:

- `organizations`
- `workspaces`
- `members`
- `roles`
- `invitations`
- `social_accounts`
- `account_credentials`
- `account_capabilities`
- `posts`
- `post_variants`
- `post_assets`
- `post_revisions`
- `post_labels`
- `publishing_slots`
- `publishing_queues`
- `queue_assignments`
- `publish_attempts`
- `publish_deliveries`
- `activity_log`
- `approval_policies`
- `approval_requests`
- `approval_comments`
- `approval_decisions`
- `client_sessions`
- `media_assets`
- `media_folders`
- `media_variants`
- `inbox_threads`
- `inbox_messages`
- `notifications`
- `notification_preferences`

Likely deprecated or heavily reshaped:
- `profiles`
- `platforms`
- `schedules`

Likely retained but evolved:
- `posts`
- `post_targets`
- `pipeline_runs`

## Recommended Technical Path

Keep:
- Next.js
- TypeScript
- Tailwind

Reconsider:
- SQLite as long-term primary store

Reason:
- parity target includes multi-user, audit logs, inbox sync, notifications, approvals, concurrent writes
- SQLite is fine for local/dev and narrow prod
- PostgreSQL is the safer target for parity-level product scope

Recommendation:
- keep SQLite for immediate stabilization if needed
- migrate to PostgreSQL before Phase 3 or 4

## Delivery Plan

### Track A. Immediate Reliability

Length:
- 1 to 2 weeks

Work:
- auth in prod
- publish correctness
- scheduler/runtime correctness
- account connection clarity
- dashboard correctness

### Track B. Product Foundations

Length:
- 2 to 3 weeks

Work:
- workspace/member/account schema
- credential storage
- access control
- account settings UI

### Track C. Composer + Calendar

Length:
- 3 to 5 weeks

Work:
- rich composer
- variants
- media system basics
- slot/queue scheduling
- publish audit

### Track D. Ops Parity

Length:
- 3 to 5 weeks

Work:
- approvals
- client portal
- notifications
- inbox

### Track E. Automation Refit

Length:
- ongoing

Work:
- native AI assist inside composer/calendar/inbox

## Rough Timeline

If done seriously:

- usable parity foundation: 6 to 8 weeks
- broad operational parity: 10 to 14 weeks
- polished differentiated product: beyond that

Anything materially faster means cutting scope.

## Risks

### Product risk

Trying to do BrightBean parity and advanced automation at the same time will stall both.

Mitigation:
- build parity surface first
- add automation after each base workflow is solid

### Technical risk

Current schema and app structure are too shallow for parity.

Mitigation:
- do not patch current tables forever
- introduce new core entities early

### Licensing risk

Direct code copy from AGPL repo may force downstream licensing decisions.

Mitigation:
- use BrightBean as reference only unless explicit legal/product call is made

### Platform risk

First-party platform integrations are harder than aggregator usage.

Mitigation:
- start with X + LinkedIn
- keep existing provider bridge while first-party adapters are built

## Recommended Next Steps

1. Finish reliability fixes in `social-poster`.
2. Write a formal parity feature matrix against BrightBean.
3. Design target schema for org/workspace/member/account/post/media.
4. Decide on PostgreSQL migration timing.
5. Implement Phase 1 and Phase 2 before any inbox or approval work.

## Immediate Build Order

If continuing in this repo now, do this exact order:

1. auth and publishing stability
2. workspace/member/account schema
3. social account connection + credential management
4. composer rebuild
5. calendar/queue rebuild
6. publish audit layer
7. approvals
8. client portal
9. media library
10. inbox
11. notifications
12. automation reintegration

## Non-Goals For Now

Do not do these early:
- pixel-perfect BrightBean UI cloning
- full platform matrix from day one
- inbox before account model is rebuilt
- approvals before composer is rebuilt
- media library before post/assets model is rebuilt

## Handoff Summary

BrightBean should be treated as:
- reference product
- reference module map
- benchmark for UX and workflow completeness

`social-poster` should evolve into:
- BrightBean-level social operations system
- with stronger automation, feed intelligence, and reply tooling

That is the right parity target.
