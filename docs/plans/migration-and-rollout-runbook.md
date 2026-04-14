# Migration And Rollout Runbook

Last updated: 2026-04-13

## Purpose

Define how to ship the parity rebuild without repeating the current class of production drift.

This runbook applies to:
- schema changes
- auth changes
- provider changes
- scheduler changes
- publish-path changes

## Rules

### Rule 1. Local first

Every production fix must be reproducible locally with:
- the same env variable names
- the same schema
- the same provider contract

### Rule 2. Additive migrations first

Do not drop or repurpose live columns until:
- new code paths are live
- reads have switched
- backfill is verified

### Rule 3. One moving part at a time

Do not combine:
- auth swap
- schema cutover
- provider swap

in one deploy unless the blast radius is tiny and the verification path is obvious.

### Rule 4. Visible health

Every risky change must expose enough state to verify:
- DB state
- runtime state
- provider/account state

## Standard Change Sequence

### 1. Update docs first

Before implementation:
- update the relevant plan doc if the design changed

### 2. Implement behind compatibility

Examples:
- add new tables before dropping old tables
- add new provider service before removing old entry points
- keep old reads available during migration where practical

### 3. Verify locally

Minimum local checks:
- build
- auth smoke test if auth changed
- scheduler smoke test if schedule logic changed
- publish smoke test if provider logic changed
- migration/backfill dry run if schema changed

### 4. Apply in dev/staging shape

For this repo, that means local/dev with production-like env before prod.

### 5. Deploy to prod

Only after local/dev verification is written down and repeatable.

### 6. Verify live

Check:
- `/api/health`
- dashboard UI state
- runtime registration state
- target account health
- one controlled publish or auth flow if applicable

## Migration Pattern By Area

### Auth

Sequence:
1. add new auth path
2. keep bypass only for local/dev if still needed
3. verify allowlist behavior
4. disable bypass in prod
5. verify redirect and API protection live

### Schema

Sequence:
1. add new tables
2. seed defaults
3. backfill old data
4. switch reads
5. switch writes
6. remove old dependencies
7. drop old tables only later

### Provider

Sequence:
1. add normalized result type
2. move one entry point to shared publisher
3. verify manual publish
4. move scheduled runner
5. verify both paths use same service
6. remove hardcoded account fallbacks

### Scheduler

Sequence:
1. add runtime reconciliation
2. expose runtime count in health/dashboard
3. verify enable/disable semantics locally
4. verify restart recovery
5. only then trust pause/resume in prod

## Verification Checklists

### Auth change

- login page renders
- unauthenticated dashboard access redirects
- protected API returns `401`
- allowlisted user succeeds
- blocked user fails cleanly

### Schema change

- migration applies on empty DB
- migration applies on current populated DB
- backfill count matches source count
- app still boots after migration

### Provider change

- account resolves from DB, not hardcoded map
- image post to test X account works
- image post to test LinkedIn account works
- error classification is visible in DB/UI

### Scheduler change

- runtime count matches DB-enabled count
- disabled schedules do not fire after restart
- zero enabled schedules means zero runtime tasks

## Rollback Posture

Rollback should favor:
- disabling new code path
- preserving data
- avoiding destructive reversions

Avoid:
- deleting partially migrated data
- mutating old tables to simulate rollback
- emergency code paths that only work in prod

## Cutover Checklist For Major Milestones

Before cutover:
- docs updated
- migration reviewed
- local verification complete
- env vars present in dev and prod
- dashboard surfaces needed health fields

During cutover:
- deploy
- run migration if needed
- confirm app boots
- confirm `/api/health`
- verify one controlled action

After cutover:
- monitor publish attempts
- monitor auth failures
- monitor scheduler runtime count
- update `docs/tasks.md`

## Definition Of Done

A change is operationally done when:
- it is documented
- it is locally reproducible
- it is deployed
- it is verified in the app, not only in logs
