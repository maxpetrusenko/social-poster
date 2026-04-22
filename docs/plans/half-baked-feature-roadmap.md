---
read_when:
  - starting half-baked feature hardening
  - coordinating multiple agents across product hardening, source-backed posts, agent runtime, approvals, and analytics
  - deciding the next implementation PR
---

# Half-Baked Feature Roadmap

Last updated: 2026-04-21

## Goal

Finish the half-baked surfaces enough that `social-poster` is a credible private proof point before extracting a public `social-poster-agent` package.

Product promise:

> Source-backed social agent for builders: turns real work into reviewed, platform-specific posts with logs and feedback.

## Build Order

### Phase 0: Trust Cleanup

Remove visible UI that over-promises.

Scope:
- replace "coming soon" primary buttons with disabled explanatory states or hide them
- make scaffold pages clearly unavailable or replace them with real minimum content
- remove mock/demo reply surfaces from production routes if real data exists
- keep docs honest

Acceptance:
- no primary-looking action says "coming soon"
- no production route looks finished when it is only a scaffold
- tests/build still pass

Main plan: `docs/plans/product-trust-hardening-plan.md`

### Phase 1: Source-Backed Posting

Generalize the existing Agent Persona GitHub/site path into reusable evidence-backed source updates.

Scope:
- evidence records from GitHub/RSS/URL/manual note/local repo
- dedupe and rejection state
- drafts generated from stored evidence
- composer/calendar preview shows source evidence

Acceptance:
- a workspace schedule can post from any configured GitHub repo or RSS source
- a draft links to its source evidence
- rejected evidence is not reused

Main plan: `docs/plans/source-backed-posting-plan.md`

### Phase 2: Agent Tool Runtime

Turn Social Agent from read-only context chat into a guarded operator.

Scope:
- typed internal tools
- confirmation guardrails
- audit entries for every tool call
- compatibility for `/invite` and `/support`
- UI shows tool trace and confirmation prompts

Acceptance:
- "draft a post from this URL" creates a draft via tool call
- "schedule it tomorrow" requires confirmation and then schedules
- logs show request, tool call, result, and side effect

Main plan: `docs/plans/agent-tool-runtime-mvp.md`

### Phase 3: Approval Gate

Add enough approval state to make agent publishing safe.

Scope:
- approval requests/comments/decisions/client links
- request approval from draft
- publish/schedule gate when workspace requires approval
- activity log and notification hooks

Acceptance:
- a draft can require approval before publishing
- client can approve/request changes through scoped link
- agent cannot publish approval-gated content without approval

Main plan: `docs/plans/approvals-and-client-portal.md`

### Phase 4: Analytics MVP

Close the feedback loop for "what worked".

Scope:
- analytics schema
- source runs/freshness
- X/Bird collector first
- Bluesky/Mastodon public counters if low-friction
- Social Agent analytics context

Acceptance:
- `/dashboard/analytics` renders real source/freshness states
- post targets show available metrics
- agent can answer "what worked this week?"

Main plan: `docs/plans/analytics-dashboard.md`

### Phase 5: Capability Truth

Make platform actions capability-driven before the agent registers tools.

Scope:
- durable capability snapshots
- connection test populates capabilities
- UI and agent hide/block unsupported actions

Acceptance:
- no agent tool exists for an unproven action
- unsupported actions are explained before execution

Main reference: `src/lib/platform-capabilities.ts`

## Multi-Agent Ownership

Use disjoint write scopes:
- UI trust cleanup: `src/app/dashboard/settings/**`, `src/app/dashboard/client-portal/**`, `src/components/dashboard/shell-scaffold-page.tsx`, visible route copy
- Source-backed posting: `src/lib/pipeline/source-backed-*`, `src/lib/pipeline/agent-persona-updates.ts`, `src/app/api/post-generation/**`, tests
- Agent runtime: new `src/agent/**`, `src/app/api/social-agent/route.ts`, `src/components/dashboard/social-agent-widget.tsx`, tests
- Approvals: schema, approval routes/components, publish guards
- Analytics: analytics schema/routes/lib/components only

Before each subagent edits:
- check `git status --short`
- list owned files
- do not revert unrelated dirty files
- add focused tests for changed behavior

## First Three PR Slices

1. `fix: remove dead public actions`
   - neutralize/hide visible coming-soon buttons
   - keep route shells honest
   - no schema changes

2. `feat: add source evidence records`
   - add evidence extraction model and tests
   - keep old Agent Persona path working
   - no agent runtime yet

3. `feat: add social agent internal tool runtime`
   - draft/list/activity tools first
   - confirmation plumbing for schedule/publish
   - audit all tool calls

## Public Launch Gate

Do not open-source or launch broadly until:
- one source-backed post flow works end-to-end
- Social Agent uses typed tools for at least draft and schedule
- publish/schedule confirms before side effects
- approval gate blocks unsafe publish when enabled
- logs show source, tool, approval, and publish result
- setup can be reproduced from clean env
