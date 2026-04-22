---
read_when:
  - implementing the Social Agent tool runtime
  - changing /api/social-agent
  - adding agent-triggered draft, schedule, publish, reply, or activity actions
---

# Agent Tool Runtime MVP

Last updated: 2026-04-21

## Goal

Replace prompt-only Social Agent actions with typed, audited, guardrailed tools.

The agent should be able to act, but only through explicit tools that enforce workspace scope and confirmations.

## Current State

Files:
- `src/app/api/social-agent/route.ts`
- `src/lib/social-agent/context.ts`
- `src/components/dashboard/social-agent-widget.tsx`
- `docs/agent-harness-reference.md`
- `docs/platform-reference/agent-harness-flows.md`

Current behavior:
- loads sanitized workspace context
- answers directly for replies/connections/schedules
- calls OpenAI once for freeform text
- handles `/invite` and `/support` through string parsing
- does not execute typed post/schedule/publish tools

## MVP Tool Set

Internal tools first:

```text
internal_context_summary
internal_activity_list
internal_post_create_draft
internal_post_schedule
internal_post_publish
internal_reply_move_to_ready
internal_reply_post
```

Do not add platform-native tools until capability truth is durable.

## Runtime Shape

Add:

```text
src/agent/types.ts
src/agent/runtime.ts
src/agent/registry.ts
src/agent/guardrails.ts
src/agent/audit.ts
src/agent/tools/post-tools.ts
src/agent/tools/reply-tools.ts
src/agent/tools/activity-tools.ts
```

Flow:

```text
POST /api/social-agent
  -> require session + tenant
  -> load context
  -> preserve slash command compatibility
  -> runtime selects/proposes tool
  -> guardrail decides execute vs confirmation
  -> execute tool if allowed
  -> write audit event
  -> return reply + tool trace + pending confirmation
```

## Confirmation Model

Preferred table:

```text
agent_pending_actions
  id
  workspace_id
  actor_user_id
  tool_name
  input_json
  status pending | confirmed | cancelled | expired | executed
  expires_at
  created_at
  updated_at
```

Confirmation required:
- publish existing post
- post reply
- delete
- admin/workspace mutations
- schedule if user did not provide explicit time/platform/copy in the current request

No confirmation:
- read context
- list activity
- create draft

## First Implementation Slices

### Slice 1: Read/Draft Tools

Files:
- add `src/agent/**`
- modify `src/app/api/social-agent/route.ts`
- add tests under `src/app/api/__tests__` or `src/lib/__tests__`

Acceptance:
- agent can create a draft through a tool
- draft action writes audit event
- no external publish side effects

### Slice 2: Pending Confirmation

Files:
- `src/db/schema.ts`
- `src/db/index.ts`
- `src/agent/guardrails.ts`
- `src/components/dashboard/social-agent-widget.tsx`

Acceptance:
- publish request returns pending confirmation instead of publishing
- confirm action executes once
- expired/cancelled confirmation cannot execute

### Slice 3: Schedule/Publish Tools

Files:
- `src/agent/tools/post-tools.ts`
- `src/app/api/posts/[id]/publish/route.ts` shared service extraction if needed
- tests

Acceptance:
- schedule tool writes scheduled post
- publish tool reuses existing publish service
- all side effects are logged

## Keep Existing Commands

`/invite` and `/support` stay working while runtime lands.

Migration path:
1. keep current handlers
2. wrap them as tools
3. route slash command to tools
4. remove duplicate string parsing only after tests cover parity

## Tests

Minimum:
- tool registry exposes only internal MVP tools
- create draft tool scopes workspace/platform IDs
- publish tool requires confirmation
- confirmation execute is idempotent
- audit writes on success and failure
- `/invite` and `/support` still work

## Do Not

- let LLM fabricate API calls
- let agent call hidden endpoints by URL
- register tools based on future/planned platform capabilities
- publish without confirmation
- expose credentials or raw provider config in tool results
