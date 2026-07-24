---
summary: "Implementation plan for the proof-gated work-to-post board, approvals, learning, analytics, traces, and person dossiers."
read_when:
  - Implementing MAX-184 through MAX-191
  - Changing work-to-post lifecycle, approval, or learning behavior
---

# Work-to-Post Learning Loop Implementation

Linear epic: MAX-184
Children: MAX-185, MAX-186, MAX-187, MAX-188, MAX-189, MAX-190, MAX-191
Phase 0: `/Users/maxpetrusenko/Desktop/Projects/mission-control/artifacts/factory/run_20260724T083822879Z_social-poster-work-to-post-learning-loop/phase-0-prd.md`

## Scope

Build a local/dev-safe vertical slice:

```text
sanitized completed-work event
  -> proof/privacy gate
  -> review candidate
  -> three provenance-backed angles
  -> comment/revision
  -> independent-review result
  -> exact Schedule or Post now intent
  -> scheduled/published projection
  -> analytics, trace timeline, and reversible learning proposal
```

No production deploy, live schedule mutation, X reply, DM, or public publish is
part of this implementation run.

## Architecture decision

Create an isolated `work-to-post` domain. Do not reuse the current reply
candidate `ready` state because it may call the live reply dispatcher.

Canonical business state stays in SQLite. Audit/activity rows and external AI
traces are secondary projections. Raw Codex, Claude, Cursor, and Hermes
transcripts remain local and never enter the app database or hosted traces.

## Public contracts

### Completion intake

`POST /api/work-to-post/events`

```ts
type CompletedWorkEventInput = {
  sourceAgent: "codex" | "claude" | "cursor" | "hermes";
  externalEventId: string;
  sessionRef: string;
  projectRef: string;
  summary: string;
  occurredAt: string;
  privacy: "public_safe" | "needs_review" | "contains_secret" | "contains_pii" | "private_client";
  proof: Array<{
    type: "commit" | "pr" | "test" | "deploy" | "benchmark" | "artifact";
    uri: string;
    hash?: string;
    verifiedAt?: string;
  }>;
};
```

The route is workspace-scoped, replay-safe by
`(workspace, sourceAgent, externalEventId)`, and returns `eligible`,
`needs_proof`, or `blocked_privacy`. V1 enables Codex and Claude adapters only.
Cursor and Hermes remain disabled until their replay and privacy fixtures pass.
The server enforces adapter/project allowlists, replaces session references with
opaque identifiers, scans for secrets, PII, private-client content, unsafe paths,
and prompt injection, and verifies proof through allowlisted resolvers. Caller
privacy labels and verification timestamps are hints, never authority. Rejected
request bodies are not logged or stored.

### Candidate aggregate

`GET /api/work-to-post/candidates`
`GET /api/work-to-post/candidates/:id`
`GET /api/work-to-post/candidates/:id/timeline`

The aggregate exposes sanitized evidence, current revision, three angles,
comments, exact approval intent, person dossier summary, trace references, and
outcome snapshots.

### Review mutations

```text
POST /api/work-to-post/candidates/:id/angles
POST /api/work-to-post/candidates/:id/comments
POST /api/work-to-post/candidates/:id/decisions
POST /api/work-to-post/learning/:id/promote
POST /api/work-to-post/learning/:id/rollback
```

Every mutation requires an idempotency key and expected revision. A
`command_receipt` binds the key to a canonical request hash and stores the replay
result in the same transaction as the mutation and lifecycle event. Reusing a key
with another payload returns `409`. Comments create a new revision and invalidate
approval. They never approve or dispatch.

Decision commands:

```ts
type DecisionCommand =
  | { type: "deny"; reasonCodes: string[] }
  | {
      type: "approve_schedule";
      scheduledAt: string;
    }
  | { type: "approve_now" };
```

The server loads the current revision, ordered media manifest, concrete account,
policy version, and passing independent review in one transaction. It chooses the
expiry and computes a versioned canonical approval digest; caller-supplied hashes
or expiry are never trusted. Dispatch recomputes the digest and fails closed on
any change.

Decision, promotion, rollback, and dispatch routes are session-only and require
the configured Max approval principal. API keys cannot impersonate an approver.
Intake may use only a narrowly scoped `work_to_post:intake` key whose organization
membership is constrained to the workspace organization. Audit records preserve
actor type and API-key identity separately from a human user.

This slice records and projects dispatch intent through an injected
`FakeDispatchAdapter`. The adapter has no imports from Bird, replies, posts,
scheduler, or provider modules; performs no network/process calls; and never
writes existing `posts`, `post_targets`, or `schedules`. Results are explicitly
`simulated_scheduled` or `simulated_published`.

### Person dossiers

`POST /api/work-to-post/people/dossiers`
`GET /api/work-to-post/people/dossiers/:id`

A dossier requires one verified primary profile plus recent first-party activity,
or two public professional sources. Every personalized statement links to a saved
claim and source URL. Ambiguous, conflicting, or stale dossiers block
personalization.

## Data model

One schema owner adds all tables and matching runtime SQLite DDL:

- `work_completion_events`
- `work_completion_proofs`
- `content_candidates`
- `content_revisions`
- `content_lifecycle_events`
- `content_trace_links`
- `content_reviews`
- `command_receipts`
- `dispatch_intents`
- `reference_examples`
- `content_angles`
- `content_comments`
- `content_decisions`
- `learning_proposals`
- `learning_rule_versions`
- `content_outcomes`
- `person_dossiers`
- `person_dossier_versions`
- `person_dossier_claims`
- `person_relationship_events`
- `content_person_dossiers`

Critical unique keys:

- completion replay: workspace + source agent + external event ID
- lifecycle replay: workspace + idempotency key
- revision number: candidate + revision number
- dossier identity: workspace + canonical identity key
- dossier version: dossier + version number
- decision replay: workspace + idempotency key
- command replay: workspace + operation + idempotency key, bound to request hash
- dispatch claim: unique approval digest and decision ID

All changes are additive. No existing post, reply, approval, or pipeline history is
rewritten.

## UI

New discoverable route: `/dashboard/review`

Visible columns:

```text
Review | Scheduled | Published
```

Review cards use stage chips for Captured, Needs proof, Angle review, Draft
review, and Approved. Rejected items live behind an archive filter.

The drawer shows:

1. proof and privacy state;
2. three angles and reference provenance;
3. current draft/media hash;
4. comments and revision diff;
5. person dossier and “why this person” when present;
6. audit/trace timeline;
7. Deny, Schedule, and Post now actions.

New `/dashboard/analytics` shows the work-to-post funnel, review timings,
revisions, decision reasons, duplicate/stale blocks, and fixture outcome
snapshots. It labels correlation and missing metrics honestly.

## Worker ownership

Work is serialized at the schema boundary.

1. Core worker owns:
   - `src/db/schema.ts`
   - `src/db/index.ts`
   - `src/lib/work-to-post/contracts.ts`
   - core repository/lifecycle/dossier modules and tests
2. Learning worker owns:
   - angle/reference/feedback/learning modules and tests
   - related API routes
   - no schema or UI files
3. UI worker owns:
   - review/analytics pages and components
   - route serializers and component/browser tests
   - no schema files
4. Integration owner owns:
   - sidebar discovery
   - fixture/demo API wiring
   - docs/status
   - final fixes after review

Workers must preserve all pre-existing dirty-tree changes and may not format or
rewrite unrelated files.

## Tracer-bullet tests

Red/green sequence:

1. Duplicate completion replay creates one candidate.
2. Missing proof produces `needs_proof`; private/secret input blocks.
3. Candidate gets exactly three distinct, provenance-backed angles.
4. Comment creates revision N+1 and invalidates prior approval.
5. Schedule creates one scheduled projection and zero immediate dispatches.
6. Post now creates one fake/local dispatch result and no scheduler duplicate.
7. One denial creates a candidate learning proposal, never a global rule.
8. Promotion and rollback are explicit, versioned, and workspace-scoped.
9. Clear dossier permits cited personalization; ambiguous/stale dossier blocks.
10. Timeline reconstructs capture through outcome without raw transcript text.
11. Same command key and hash returns its stored result; changed hash returns 409.
12. Fake dispatch has no forbidden imports, network, process, or legacy-table writes.
13. Fresh DB and existing DB upgrade have matching columns, indexes, foreign keys,
    defaults, nullability, and uniqueness; `foreign_key_check` is clean.

## Verification

Focused unit/integration tests first, then:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

UI/API proof:

- fixture-backed desktop review flow at 1440px;
- narrow flow at 375px;
- keyboard/focus and mutation error states;
- API replay, stale revision, wrong-workspace, and hash mismatch checks;
- no outbound network or provider mutation in tests.

Final gates:

- gstack review fallback because the requested Steipete autoreview package was
  blocked by Hermes' security scanner;
- independent reviewer findings verified and fixed;
- behavior QA against the running local app;
- process telemetry with TDD, QA, review, and monitoring status.

## Dispatch order

1. Core schema/contracts/repository and local tracer bullet.
2. Angles, feedback, and reversible learning.
3. Board, exact approval intents, analytics, and trace explorer.
4. Integration, full tests, behavior QA, review, docs, and Linear evidence.
