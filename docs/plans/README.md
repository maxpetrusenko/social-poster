# Plans Index

Last updated: 2026-04-22

## Purpose

This folder is the implementation handoff for the BrightBean-parity rebuild of `social-poster`.

Read these in order before major feature work:
1. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-parity-handoff.md`
2. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-parity-feature-matrix.md`
3. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/phase-0-stabilization-checklist.md`
4. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/social-poster-target-schema-v1.md`
5. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/provider-architecture.md`
6. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/composer-calendar-schema-v2.md`
7. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/parity-implementation-backlog.md`
8. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/migration-and-rollout-runbook.md`
9. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/open-decisions.md`
10. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/approvals-and-client-portal.md`
11. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/inbox-and-replies.md`
12. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/notifications-and-activity.md`
13. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/analytics-dashboard.md`
14. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/agent-oss-positioning.md`
15. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/product-hardening-before-oss.md`
16. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/half-baked-feature-roadmap.md`
17. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/agent-tool-runtime-mvp.md`
18. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/source-backed-posting-plan.md`
19. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/product-trust-hardening-plan.md`
20. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/content-engine-article-agent.md`
21. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/campaign-creative-engine-plan.md`
22. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-menu-port-map.md`
23. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/brightbean-merged-menu-flow.html`
24. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/platform-flow-reference.html`
25. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/page-flow-reference.html`
26. `/Users/maxpetrusenko/Desktop/Projects/social-poster/docs/plans/flow-handoff-tabs.html`

## What Each Doc Solves

### Strategy

- `brightbean-parity-handoff.md`
  - overall product direction
  - phase order
  - AGPL guardrail

- `brightbean-parity-feature-matrix.md`
  - feature-by-feature gap map
  - current-state assessment
  - phase and priority mapping

### Before Building

- `phase-0-stabilization-checklist.md`
  - what must be fixed before parity work
  - acceptance criteria for auth, publishing, scheduler, and status truth

- `provider-architecture.md`
  - one publishing contract
  - account capability model
  - Late/Bird/direct roles

### Data Model

- `social-poster-target-schema-v1.md`
  - tenancy
  - membership
  - social accounts
  - credentials

- `composer-calendar-schema-v2.md`
  - composer
  - media
  - queues
  - slots
  - scheduling
  - publish attempts
  - activity log

### Execution

- `parity-implementation-backlog.md`
  - milestone-by-milestone build order
  - dependencies
  - definition of done

- `migration-and-rollout-runbook.md`
  - local/dev/prod rollout sequence
  - migration rules
  - cutover checks
  - rollback posture

- `open-decisions.md`
  - unresolved architecture calls
  - provisional defaults
  - recommendation per blocker

### Later Product Surfaces

- `approvals-and-client-portal.md`
  - approval states
  - internal comments
  - client review links and boundaries

- `inbox-and-replies.md`
  - conversation model
  - reply drafts
  - Bird transition path
  - SLA and routing

- `notifications-and-activity.md`
  - global activity log
  - in-app notifications
  - delivery records
  - preferences and quiet hours

- `analytics-dashboard.md`
  - left-nav Analytics route plan
  - provider/source strategy by platform
  - Bird and Sweetistics role for X/Twitter analytics
  - normalized analytics schema and rollout phases

- `agent-oss-positioning.md`
  - open-source strategy
  - source-backed agent wedge
  - public package boundary
  - competitor positioning

- `product-hardening-before-oss.md`
  - half-baked surfaces
  - fix order before public launch
  - agent/runtime/product hardening gates

- `half-baked-feature-roadmap.md`
  - exact finish order for half-baked features
  - cross-agent ownership boundaries
  - public launch gate

- `agent-tool-runtime-mvp.md`
  - typed Social Agent tool runtime
  - confirmation guardrails
  - audit and first implementation slices

- `source-backed-posting-plan.md`
  - GitHub/RSS/URL evidence model
  - source-backed schedule mode
  - public demo requirements

- `product-trust-hardening-plan.md`
  - dead-button and scaffold cleanup
  - mock/demo production gating
  - route/nav hardening rules

- `content-engine-article-agent.md`
  - article and Medium automation product boundary
  - OpenAI text + Gemini image API strategy
  - source-of-truth article workflow
  - review-first rollout and test plan

- `campaign-creative-engine-plan.md`
  - profile-owned Campaigns architecture
  - Gemini image generation and crop/export workflow
  - creative editor, platform renditions, and calendar apply flow

- `brightbean-menu-port-map.md`
  - merged menu map
  - shell-by-shell target
  - copy vs rebuild rule

- `brightbean-merged-menu-flow.html`
  - inline visual for shell review
  - menu-by-menu flow board

- `platform-flow-reference.html`
  - per-platform connect and publish reference
  - format/capability/validation expectations

- `page-flow-reference.html`
  - per-page and per-shell operator flows
  - nested flow groups inside major pages

- `flow-handoff-tabs.html`
  - canonical single-file handoff
  - tabs for platforms, pages, and implementation notes
  - official provider doc links

## Minimum Doc Set To Start Coding

Strict minimum:
- `phase-0-stabilization-checklist.md`
- `social-poster-target-schema-v1.md`
- `provider-architecture.md`

Minimum doc set to finish the parity rebuild cleanly:
- all docs in this folder

## Working Rule

Do not start:
- composer rebuild
- calendar rebuild
- approvals
- inbox

until:
- Phase 0 exit criteria are met
- schema v1 is in place
- provider contract is settled
