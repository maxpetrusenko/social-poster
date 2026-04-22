---
read_when:
  - preparing social-poster for public launch or open-source extraction
  - deciding what is still half-baked
  - planning the next hardening sprint
---

# Product Hardening Before OSS

Last updated: 2026-04-21

## Goal

Make `social-poster` credible before using it as a public proof point.

This does not mean feature parity with Buffer, Postiz, or PostHero. It means the product must be honest, reliable, and demoable around the wedge:

> Source-backed social agent for builders.

## Current Half-Baked Areas

### 1. Social Agent Is Mostly Read-Only

Evidence:
- `docs/agent-harness-reference.md` says the current agent is one API route plus context loading.
- `src/app/api/social-agent/route.ts` answers from context and only has string-parsed inline actions for `/invite` and `/support`.
- `src/lib/social-agent/context.ts` exposes "availableActions", but the agent cannot execute them as typed tools.

Problem:
- Users can ask it about posts, schedules, replies, and platforms.
- It cannot safely draft, schedule, publish, fetch analytics, or operate inbox actions through a tool loop.

Fix plan:
1. Add `src/agent/types.ts` with `AgentTool`, `ToolResult`, `AgentContext`, `AgentPlugin`, and `PendingAction`.
2. Add internal tools first:
   - `internal_post_create_draft`
   - `internal_post_schedule`
   - `internal_post_publish`
   - `internal_reply_approve`
   - `internal_activity_list`
3. Add guardrail plugin:
   - publish, delete, send reply, and schedule require confirmation
   - read-only tools do not
4. Add audit plugin:
   - request id
   - tool name
   - input hash
   - outcome
   - actor/workspace/platform
5. Replace inline regex actions with typed tools.
6. Update the chat UI to show tool calls, confirmations, and final action results.

Definition of done:
- "Draft a post from this URL for X and LinkedIn" creates a draft through a tool.
- "Schedule it tomorrow at 9" produces a confirmation, then schedules after approval.
- Logs show every tool call and side effect.

### 2. Repo-To-Post Exists Only As A Special-Case Pipeline

Evidence:
- `src/lib/pipeline/agent-persona-updates.ts` can read a site, GitHub org events, and repo metadata.
- Defaults are specific to `agent-persona.org`, `agent-persona`, and `personas-pipeline`.

Problem:
- The right wedge exists, but it is not productized.
- It is hardcoded around one campaign style instead of being a reusable "source-backed post" system.

Fix plan:
1. Rename the concept from `agent_persona_updates` to a generic `source_backed_update`.
2. Add source config:
   - `sourceType`: `github_org`, `github_repo`, `rss`, `url`, `manual_note`, `local_repo`
   - `sourceUrl`
   - `githubOwner`
   - `githubRepo`
   - `lookbackHours`
   - `includePrs`
   - `includeIssues`
   - `includeReleases`
3. Store extracted evidence before generation:
   - source id
   - title
   - URL
   - summary
   - event timestamp
   - dedupe key
4. Generate platform drafts from evidence records, not direct fetch output.
5. Show the source evidence in the composer and calendar preview.

Definition of done:
- A schedule can post from any configured GitHub repo, not just Agent Persona.
- A draft links back to the source event that caused it.
- The user can reject an event so it is not reused.

### 3. Analytics Is Planned But Not Built

Evidence:
- `docs/plans/analytics-dashboard.md` exists and defines the intended routes and tables.
- Platform configs repeatedly say analytics is "coming soon".
- There is no left-nav Analytics route or normalized analytics tables yet.

Problem:
- The product can publish, but cannot prove what worked.
- The agent cannot learn from performance.

Fix plan:
1. Land analytics schema:
   - `analytics_source_runs`
   - `analytics_snapshots`
   - `analytics_post_metrics`
   - `analytics_audience_snapshots`
2. Add analytics route shells with honest empty/permission states.
3. Build X first:
   - Bird-backed public/live metrics where useful.
   - Native X API when access is available.
4. Add Bluesky/Mastodon simple public counters because they are low-friction.
5. Feed summary metrics into Social Agent context.

Definition of done:
- `/dashboard/analytics` exists.
- Published post targets show source, freshness, and at least one metric where available.
- Agent can answer "what worked this week?" from stored metrics.

### 4. Approvals And Client Portal Are Shells/Plans

Evidence:
- `docs/plans/approvals-and-client-portal.md` says the repo has no first-class approval system.
- Client portal routes use `ShellScaffoldPage`.
- Composer copy says approval is placeholder until the approval model lands.

Problem:
- This blocks agency/team credibility.
- It also blocks safe agent publishing because approval is not a first-class state.

Fix plan:
1. Add approval tables:
   - `approval_requests`
   - `approval_comments`
   - `approval_decisions`
   - `client_portal_links`
2. Add "Request approval" on draft posts.
3. Add internal comments.
4. Add tokenized client review link.
5. Gate publish/schedule when workspace approval mode requires approval.
6. Add activity log events for request, comment, approval, changes requested, and release.

Definition of done:
- A draft can require approval before publishing.
- Client can approve/request changes without full workspace access.
- Agent cannot publish approval-gated content without approval.

### 5. Settings/Billing/Danger Areas Still Contain Dead Buttons

Evidence:
- Billing page has "Add payment method (coming soon)" and "Upgrade plan (coming soon)".
- Danger page has delete/export "coming soon".
- Profile settings has "Edit profile (coming soon)".

Problem:
- Public demos lose trust when buttons promise work that is absent.

Fix plan:
1. Replace dead buttons with either working actions or clear disabled states with no primary CTA styling.
2. Wire danger actions that already exist in `src/app/dashboard/settings/actions.ts` into the UI where safe.
3. Add export endpoint before showing export as an action.
4. Hide billing upgrade until Stripe exists, or make it a waitlist/contact action.

Definition of done:
- No primary-looking button says "coming soon".
- Every visible action either works or is explicitly disabled with a reason.

### 6. Platform Capability Truth Is Transitional

Evidence:
- `src/lib/platform-capabilities.ts` has a "legacy-default" fallback until account capabilities land.
- Provider/platform config files advertise many future capabilities.

Problem:
- The UI can imply support that the connected account cannot actually perform.
- Agent tools must not register against implied capability.

Fix plan:
1. Add durable `social_account_capabilities` or store normalized capability snapshots on `platforms.config`.
2. Populate capabilities after OAuth/test connection.
3. Register agent tools only from proven capabilities.
4. Add a capability health panel per platform.

Definition of done:
- Unsupported actions are hidden or blocked before execution.
- Agent cannot call a tool for an unproven capability.

## Hardening Sprint Order

Do this exact order:

1. Remove public-facing dead buttons and scaffold illusions.
2. Productize source-backed updates from GitHub/repo/RSS into reusable evidence records.
3. Build the internal agent tool loop with guardrails and audit.
4. Land approvals enough to gate agent publish.
5. Add analytics MVP enough to close the feedback loop.
6. Extract public `social-poster-agent` package after the above demo works in private.

## Public Launch Gate

Do not open-source or publicly market the app until:

- one source-backed demo works end-to-end
- agent actions are typed tools, not prompt claims
- publish/schedule actions require confirmation
- audit log shows source, approval, and publish result
- no obvious scaffold pages look like finished product
- setup instructions are accurate from a clean environment

## Private App vs Public Agent Boundary

Private app:
- dashboard
- hosted OAuth
- billing
- multi-workspace/team settings
- client portal
- analytics UI
- production scheduler
- managed queue/retry

Public agent:
- source connectors
- draft generation
- platform adaptation
- approval contract
- audit contract
- dry-run publisher
- one or two real adapters
- MCP/CLI surface
