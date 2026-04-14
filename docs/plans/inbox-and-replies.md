# Inbox And Replies Parity

Last updated: 2026-04-13

## Purpose

Define the inbox and reply surface that comes after the core account model exists.

Current state:
- reply engine is a worker sidecar
- X replies are discovered, drafted, and sent from `src/lib/pipeline/runners/reply-engine.ts`
- reply history is logged in `replyEvents`
- dashboard reply UI is event log first, not conversation first

Target state:
- operator inbox
- conversations and messages as first-class records
- assignments and SLAs
- saved replies and reply drafts
- Bird as one transport path, not the whole product

Depends on:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/phase-0-stabilization-checklist.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/social-poster-target-schema-v1.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`

## Product Shape

The inbox should answer:
- what conversation needs attention
- who owns it
- what SLA is at risk
- what reply is suggested
- what was sent, by whom, and through which account

Do not model this as a flat reply log.
Model it as a conversation workspace with messages, assignments, drafts, and attempts.

## Core Model

### `inbox_conversations`

Role:
- one thread per external conversation or mention chain

Key columns:
- `id`
- `workspace_id`
- `provider`
- `social_account_id`
- `external_thread_id`
- `external_conversation_url`
- `subject` nullable
- `status`
- `priority`
- `assignee_user_id` nullable
- `last_message_at`
- `first_message_at`
- `sla_due_at` nullable
- `risk_score`
- `metadata_json`
- `created_at`
- `updated_at`

Recommended status set:
- `open`
- `needs_reply`
- `waiting_on_us`
- `waiting_on_them`
- `snoozed`
- `closed`

### `inbox_messages`

Role:
- immutable message timeline inside a conversation

Key columns:
- `id`
- `conversation_id`
- `workspace_id`
- `provider_message_id`
- `direction`
- `author_handle`
- `author_name` nullable
- `body`
- `body_text`
- `raw_payload_json`
- `source_url` nullable
- `sent_at`
- `read_at` nullable
- `created_at`

Recommended direction set:
- `incoming`
- `outgoing`
- `system`

### `reply_drafts`

Role:
- editable draft reply tied to a conversation or message

Key columns:
- `id`
- `workspace_id`
- `conversation_id`
- `message_id` nullable
- `draft_body`
- `tone`
- `status`
- `generated_by`
- `source`
- `approved_by_user_id` nullable
- `sent_at` nullable
- `created_at`
- `updated_at`

Recommended status set:
- `suggested`
- `edited`
- `approved`
- `sent`
- `discarded`

### `saved_replies`

Role:
- reusable response snippets for fast operator replies

Key columns:
- `id`
- `workspace_id`
- `name`
- `body`
- `platform`
- `category` nullable
- `variables_json`
- `is_active`
- `created_by_user_id`
- `created_at`
- `updated_at`

Use for:
- acknowledgements
- routing handoffs
- deflection replies
- common support answers
- internal shorthand turned into public text

### `inbox_assignments`

Role:
- ownership history and current assignment

Key columns:
- `id`
- `conversation_id`
- `workspace_id`
- `assigned_to_user_id`
- `assigned_by_user_id` nullable
- `assignment_reason` nullable
- `status`
- `assigned_at`
- `released_at` nullable

Recommended status set:
- `active`
- `reassigned`
- `completed`
- `abandoned`

### `reply_routing_rules`

Role:
- deterministic triage and SLA defaults

Key columns:
- `id`
- `workspace_id`
- `name`
- `priority`
- `match_json`
- `target_queue`
- `target_role` nullable
- `sla_minutes`
- `auto_assign`
- `auto_suggest`
- `is_active`
- `created_at`
- `updated_at`

## Operator Flow

1. inbox opens on highest-priority conversations
2. operator sees thread, context, SLA, owner, and suggested next action
3. operator picks a saved reply or generated draft
4. operator edits text inline and assigns if needed
5. operator sends through the selected account
6. app records attempt, message, and outcome
7. thread moves to waiting, closed, or needs follow-up

Fast path:
- open
- draft
- send
- done

Review path:
- open
- assign
- draft
- approve
- send
- audit

## SLA And Routing Ideas

Keep routing simple first.

Suggested rules:
- high-value accounts get short SLA and direct assignment
- risky or ambiguous topics go to `manual_lock`
- mentions and replies on priority handles route to on-call owner
- stale threads move to the top of the inbox
- repeated follow-up threads reopen automatically

Useful signals:
- account priority
- author importance
- topic category
- thread age
- prior reply history
- duplicate risk
- manual-only vs auto-draft lane

Practical SLA tiers:
- urgent: under 15 minutes
- standard: under 2 hours
- low priority: same day

## Bird Transition Path

Bird stays useful, but only as one provider path.

Transition order:
1. keep current Bird-based reply sidecar running
2. write its output into conversation and message tables
3. expose the same threads in the inbox UI
4. let operators edit and send from the inbox
5. move routing and drafting into the inbox service
6. keep Bird as the X transport adapter until direct X credentials are ready
7. later add per-account transport selection through provider capabilities

Implication:
- Bird is the transport
- inbox is the product
- `replyEvents` becomes an audit slice, not the main UI model

## Sidecar To Product Surface

Current reply engine does three things:
- discovers candidates
- generates drafts
- sends replies

That should evolve into:
- candidate discovery creates inbox conversations
- draft generation creates reply drafts
- send logic becomes a reply attempt service
- dashboard becomes the place to triage and approve

The worker sidecar should remain the background producer.
The inbox should become the operator control plane.

## Schema Suggestions

Do not keep only `replyEvents`.

Add:
- conversation table
- message table
- assignment table
- saved reply table
- reply draft table
- routing rule table
- reply attempt table

Optional later:
- labels
- snooze table
- internal notes
- watch/follow state
- mention snapshot cache

## Rollout Order

1. add conversation and message read model
2. backfill from existing `replyEvents`
3. build read-only inbox UI
4. add saved replies
5. add draft editor and reply preview
6. add assignment and SLA state
7. wire Bird sends through reply attempt records
8. promote inbox UI over the current reply log view
9. add routing rules and auto-assignment
10. phase out reply-engine-only UX

## Definition Of Done

Inbox and replies parity is ready when:
- every reply lives inside a conversation thread
- operators can assign, draft, send, and audit from one surface
- saved replies work across the inbox
- SLA state is visible and actionable
- Bird still works as a transport adapter
- `replyEvents` is no longer the primary product surface
- current sidecar can feed the inbox without duplicate models
