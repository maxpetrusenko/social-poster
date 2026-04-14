# Approvals And Client Portal

Last updated: 2026-04-13

## Purpose

Define the approval workflow and client-facing review surface for the BrightBean-parity rebuild.

References:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-parity-handoff.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-parity-feature-matrix.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/parity-implementation-backlog.md`

## Current Problem

The repo has no first-class approval system yet.

Current gap:
- draft state, scheduling state, and delivery state are already muddy
- internal review notes have nowhere clean to live
- client review should not require full workspace auth
- reminder loops are not modeled

## Design Rules

1. Approval state is first-class.
   Keep approval separate from publish state, even if the UI mirrors one into the other.

2. Internal comments are not client comments.
   Staff discussion must stay visible only to workspace members.

3. Client portal is review-only by default.
   It should let a client inspect, comment, approve, or request changes, but not manage the workspace.

4. Links are scoped and revocable.
   Client access should work through shareable review links or portal tokens, not broad staff sessions.

5. Reminders are part of the workflow.
   They should trigger from open approval requests, not from ad hoc manual follow-up.

## State Model

Use one approval workflow with a small stable state set.

Suggested approval states:
- `none`
- `requested`
- `in_review`
- `changes_requested`
- `approved`
- `rejected`
- `withdrawn`
- `expired`

Suggested content status mirror:
- `draft`
- `ready`
- `in_review`
- `approved`
- `scheduled`
- `published`
- `partial_failure`
- `failed`

Rule:
- the approval request owns review truth
- `posts.status` can mirror the current approval stage for operator convenience, but should not be the only source of truth

## Workflow

Recommended flow:
1. editor finishes a draft
2. approval request is created
3. internal reviewers comment if needed
4. client receives a review link
5. client approves or requests changes
6. if changes are requested, the draft returns to editing
7. if approved, the post can move to schedule or publish-ready state
8. if withdrawn or expired, the request is closed without publishing

Transition rules:
- `draft -> requested` when a review is opened
- `requested -> in_review` when at least one reviewer opens or comments
- `in_review -> changes_requested` when a reviewer asks for edits
- `in_review -> approved` when an authorized approver or client approves
- `in_review -> rejected` when the request is explicitly rejected
- `approved -> scheduled` or `approved -> ready` when the post is released downstream
- any open state -> `withdrawn` when the author cancels the review
- any open state -> `expired` when the link or request times out

## Internal Comments

Internal comments should support:
- staff-only visibility
- thread or reply chain if useful, but simple linear comments are enough for the first pass
- author, timestamp, and optional mention/assignment metadata
- attachment to the approval request, not just the post body

Notes:
- internal comments should survive draft revisions
- a new revision should not erase review history

## Client Review Links

Client access should be shaped as a narrow review surface.

Recommended behavior:
- tokenized link tied to one approval request
- optional email binding for extra friction
- explicit expiration and revoke support
- read-only preview by default
- comment, approve, request changes actions only

The review page should show:
- title and summary
- rendered content preview
- selected assets
- prior comments
- current decision status
- due date, if any

## Client Portal Boundaries

The portal should not expose:
- inbox
- media library browsing beyond approved assets
- scheduler internals
- account credentials
- team settings
- publish logs beyond the current item
- unrelated workspace drafts

The portal should expose:
- assigned review items
- current review state
- comments and decisions
- asset preview for the specific request
- due date and reminder context

Boundary rule:
- if a client does not need the data to approve the content, it should stay out of the portal

## Reminders

Reminders should be driven by request state and due date.

Suggested reminder rules:
- one reminder after initial request if no response
- repeated reminders until decision or expiry
- escalation to internal owner if the request stalls past due date

Suggested data needs:
- request due date
- last reminder sent at
- reminder policy
- reminder history
- current assignee or owner

Notes:
- reminders should be visible in the activity log
- reminder cadence should be configurable per workspace or approval policy, not hardcoded per post

## Schema Suggestions

Keep the model additive and aligned with the existing target schema docs.

Suggested tables:
- `approval_policies`
- `approval_requests`
- `approval_comments`
- `approval_decisions`
- `approval_reminders`
- `client_portal_links`

Useful columns for `approval_requests`:
- `id`
- `workspace_id`
- `post_id`
- `post_variant_id` nullable
- `status`
- `requested_by_user_id`
- `requested_for_role` or `requested_for_email`
- `due_at` nullable
- `opened_at` nullable
- `resolved_at` nullable
- `current_revision_id` nullable
- `policy_snapshot_json`
- `created_at`
- `updated_at`

Useful columns for `approval_comments`:
- `id`
- `approval_request_id`
- `author_user_id` nullable
- `author_type`
- `visibility`
- `body`
- `parent_id` nullable
- `created_at`

Useful columns for `client_portal_links`:
- `id`
- `approval_request_id`
- `token_hash`
- `email` nullable
- `expires_at`
- `revoked_at` nullable
- `last_used_at` nullable
- `created_at`

## Rollout Order

Do this in order:
1. land the schema and state model
2. add internal approval requests and comments in staff UI
3. add client review links with read-only preview
4. add approve and request-changes actions
5. add reminders and expiry handling
6. wire approval release into scheduling and publish paths
7. add activity logging and notification hooks

Keep the release path additive:
- approvals should gate publishing before they replace any existing manual workflow
- client portal can ship as a thin review surface before it becomes a branded experience

## Definition Of Done

Approvals and client portal are done when:
- a draft can be sent to review
- internal staff can comment without exposing those notes to clients
- a client can open a secure review link and act on the draft
- approval state is visible in the app, not only in logs
- reminders fire for stalled reviews
- approved content can flow into the downstream schedule or publish path
- the portal boundaries are strict enough that the client never sees workspace internals
