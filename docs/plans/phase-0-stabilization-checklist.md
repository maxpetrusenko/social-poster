# Phase 0 Stabilization Checklist

Last updated: 2026-04-13

## Purpose

Define the stabilization bar before BrightBean-parity feature work starts.

This phase is not optional.

Current failure pattern:
- scheduler/runtime drift
- auth bypass still possible in production shape
- provider paths drift between cron and manual publish
- status reporting can be misleading
- account model is too implicit to debug quickly

Reference code:
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/scheduler.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/schedule-jobs.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/pipeline/publisher.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/app/api/posts/[id]/publish/route.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/auth-config.ts`
- `/Users/maxpetrusenko/Desktop/Projects/social-poster/src/lib/auth.ts`

## Exit Criteria

Phase 0 is complete only when all of these are true:

- production auth bypass is off
- dashboard auth is gated by real Google/Supabase session checks
- schedule enable/disable state matches runtime task registration
- stopping schedules actually stops runtime execution without process ambiguity
- manual publish and cron publish use the same provider contract
- post status, target status, and run status agree with real delivery outcomes
- image posting to X and LinkedIn is locally reproducible with the same env model used in production
- failure reasons are visible without reading raw logs
- image-only enablement is enforced by account capability checks, not manual caution

## Workstream A: Auth

### Problems

- `DISABLE_AUTH` defaults to on
- bypass behavior can mask real auth regressions
- there is no durable workspace-aware user model yet

### Required fixes

- require `DISABLE_AUTH=false` in production
- fail closed when Supabase env is missing in production mode
- use allowlist checks consistently after Google auth
- remove any auto-bounce behavior that reaches `/dashboard` without a real session
- add local/dev instructions for running the same auth flow with the same public env keys

### Acceptance tests

- unauthenticated request to `/dashboard` redirects to `/login`
- unauthenticated request to protected API returns `401`
- authenticated allowlisted user reaches dashboard
- authenticated non-allowlisted user is blocked cleanly
- local/dev can reproduce the same behavior without extra undocumented steps

## Workstream B: Scheduler And Runtime State

### Problems

- schedules can be disabled in DB while still running in memory
- runtime registration state is process-local and not operator-visible enough
- reload semantics are too coarse

### Required fixes

- schedule create/update/delete/enable/disable must always call one runtime reconciliation path
- runtime reconciliation must be idempotent
- scheduler startup must only register enabled schedules
- disabled schedules must be unregistered immediately
- `/api/health` and dashboard must report both DB-enabled count and runtime-registered count

### Acceptance tests

- enable a schedule, observe registration count increase
- disable the same schedule, observe registration count decrease immediately
- restart app, confirm only enabled schedules register
- disabling all schedules results in zero runtime tasks without manual restart

## Workstream C: Publish Path Unification

### Problems

- provider logic is split across cron/manual history
- account defaults are still hardcoded in `publisher.ts`
- publish behavior depends on implicit platform assumptions

### Required fixes

- one publish service for manual, cron, and future queue dispatch
- publisher must resolve account identity from durable account records, not hardcoded maps
- provider selection must be explicit per account
- provider result normalization must be shared

### Acceptance tests

- same post published manually and via scheduled path hits the same publisher entry point
- X image publish and LinkedIn image publish succeed through the same contract
- failure payloads normalize into one shared error shape

## Workstream D: Status Truth

### Problems

- `posts.status`, `post_targets.status`, and `pipeline_runs.status` can drift
- dashboard can imply failure or success from incomplete information
- duplicate responses can look like hard failures unless normalized

### Required fixes

- define canonical state transitions for:
  - post
  - post target
  - publish attempt
  - pipeline run
- separate delivery attempts from higher-level post state
- normalize duplicate/provider-limit errors into explicit classes
- keep raw provider payload in audit tables or step output for debugging

### Acceptance tests

- one target failure causes:
  - post target = failed
  - run = failed
  - post = partial or failed according to chosen rule, but documented and consistent
- duplicate result is classified distinctly from unknown provider failure
- dashboard labels match stored state rules

## Workstream E: Capability Gating

### Problems

- "image only, not video" is currently operational discipline, not modeled truth
- reply engine, image posting, and video posting are controlled in different ways

### Required fixes

- add explicit account capability checks before publish dispatch
- schedule/job type checks must fail fast if target accounts do not support the requested media type
- dashboard should show why a given account can or cannot be used for a job

### Acceptance tests

- image-only account accepts image post
- image-only account rejects video post before provider call
- reply-only flow does not expose video/image publish toggles as if they were supported

## Workstream F: Local / Dev / Prod Parity

### Rule

No production-only fixes.

### Required fixes

- same env keys documented in `.env.example`
- same schema migrations applied in local/dev before prod
- same auth path works in local/dev with the right env values
- same publisher path can be exercised locally against test accounts or a provider sandbox

### Acceptance tests

- local manual image post to test account
- local auth gate check
- local scheduler enable/disable check
- production health output matches the same fields exposed locally

## Minimum Regression Coverage

Add tests where they fit:
- auth gate behavior
- scheduler reconciliation
- status resolver logic
- provider result normalization
- capability gating for image vs video

If a case is not practical as an automated test, add a short manual verification script to the rollout runbook.

## Definition Of Done

Phase 0 is done when:
- checklist items are implemented
- tests cover the risky logic seams
- `docs/tasks.md` reflects the new stable baseline
- at least one local image publish to X and one to LinkedIn are verified with the real provider contract
- schedules can be paused and resumed without runtime drift
