---
read_when:
  - implementing repo/GitHub/RSS/source-backed posting
  - changing agent_persona_updates or post-generation routes
  - preparing the public agent demo
---

# Source-Backed Posting Plan

Last updated: 2026-04-21

## Goal

Generalize the existing Agent Persona schedule path into a reusable system:

```text
real source event -> evidence record -> platform draft -> approval -> schedule/publish -> feedback
```

This is the core open-source wedge.

## Current State

Useful files:
- `src/lib/pipeline/agent-persona-updates.ts`
- `src/lib/pipeline/agent-persona-updates.test.ts`
- `src/app/api/post-generation/url/route.ts`
- `src/app/api/post-generation/rss/route.ts`
- `src/app/api/post-generation/x/route.ts`
- `src/lib/dashboard/candidates.ts`
- `src/lib/pipeline/fixed-schedule-post.ts`
- `src/lib/pipeline/runners/image-post.ts`

Current behavior:
- Agent Persona schedule can read a configured site, GitHub org events, repo metadata, and make platform copy.
- URL generation extracts page title/description/OG image.
- RSS generation chooses cached candidates and writes platform captions.
- X generation reads Bird home timeline candidates.

Gap:
- evidence is not a first-class stored concept
- Agent Persona defaults are campaign-specific
- rejection/dedupe exists indirectly, not as operator-visible source state
- composer/calendar do not consistently show source evidence as the reason for a draft

## Data Model

Preferred tables:

```text
source_feeds
  id
  workspace_id
  type github_repo | github_org | rss | url | manual_note | local_repo
  name
  config_json
  enabled
  last_checked_at nullable
  created_at
  updated_at

source_evidence
  id
  workspace_id
  source_feed_id nullable
  type commit | pr | release | issue | docs_change | rss_item | url | note
  title
  summary
  url nullable
  external_id nullable
  event_at nullable
  dedupe_key
  status new | drafted | rejected | used | stale
  metadata_json nullable
  created_at
  updated_at
```

Link posts to evidence:

```text
posts.metadata.sourceEvidenceId
posts.sourceUrl
posts.sourceTitle
```

## Source Config

Schedule config should support:

```json
{
  "postMode": "source_backed_update",
  "sourceFeedId": "...",
  "sourceType": "github_repo",
  "githubOwner": "maxpetrusenko",
  "githubRepo": "social-poster",
  "lookbackHours": 72,
  "includePrs": true,
  "includeIssues": false,
  "includeReleases": true,
  "platformStrategy": {
    "x": "short_ship_note",
    "linkedin": "builder_context"
  }
}
```

Keep `agent_persona_updates` working as a compatibility alias until old schedules are migrated.

## Extraction Contract

Add:

```text
src/lib/sources/types.ts
src/lib/sources/github.ts
src/lib/sources/rss.ts
src/lib/sources/url.ts
src/lib/sources/manual.ts
src/lib/sources/evidence-store.ts
```

Contract:

```ts
type SourceEvidenceCandidate = {
  type: string;
  title: string;
  summary: string;
  url?: string;
  externalId?: string;
  eventAt?: Date;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
};
```

## First Implementation Slices

### Slice 1: Evidence Extraction Library

Add `src/lib/sources/**` with GitHub/RSS/URL extractors and tests.

Acceptance:
- GitHub repo extractor returns PR/release evidence with stable dedupe keys
- URL extractor wraps existing title/description/OG parsing
- RSS extractor wraps candidate rows without changing current RSS UI

### Slice 2: Store + Composer Preview

Add tables and evidence store.

Acceptance:
- evidence can be created/listed/rejected
- composer can create a draft from an evidence id
- post detail shows source evidence title/url/status

### Slice 3: Schedule Runner Integration

Add `source_backed_update` schedule mode.

Acceptance:
- any configured GitHub repo can drive a scheduled draft/post
- used evidence is marked `used`
- rejected evidence is skipped
- existing Agent Persona schedules still run

## Tests

Minimum:
- GitHub event normalization and dedupe keys
- RSS evidence normalization
- URL evidence normalization
- rejected evidence not selected
- used evidence not selected again
- Agent Persona compatibility alias

## Public Demo Requirement

The demo must show:
- source event URL
- generated X + LinkedIn drafts
- approval action
- resulting scheduled/published post
- activity log showing source evidence id and publish result
